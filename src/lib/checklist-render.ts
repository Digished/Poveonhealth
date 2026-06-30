import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { categoryToDepartment, DEFAULT_DEPARTMENTS, type DepartmentConfig, type WorkflowType } from "@/lib/lims-shared";
import { VisitChecklistPdf, type ChecklistGroup, type ChecklistTest } from "@/lib/checklist-pdf";

type BreakdownItem = { raw?: string; canonical_name?: string; category?: string | null; unit_price?: number | null };

const WORKFLOW_HINT: Record<WorkflowType, string> = {
  specimen: "Sample collection",
  imaging: "Imaging / scan",
  procedure: "Procedure",
};

/** Fetch a lab logo and return it as a data: URL react-pdf can embed. Only
 *  raster formats (PNG/JPEG) are supported by react-pdf <Image>; anything else
 *  (e.g. SVG) or a failed fetch returns null so the PDF still renders. */
async function logoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!/(png|jpe?g)/.test(ct)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 3_000_000) return null;
    const mime = ct.includes("jpeg") || ct.includes("jpg") ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Build the department-grouped test checklist for a request. */
function buildGroups(testBreakdown: unknown, testsString: string, departments: DepartmentConfig[]): ChecklistGroup[] {
  const order: string[] = [];
  const byDept = new Map<string, { workflow: WorkflowType; tests: ChecklistTest[] }>();

  const push = (department: string, workflow: WorkflowType, test: ChecklistTest) => {
    if (!byDept.has(department)) { byDept.set(department, { workflow, tests: [] }); order.push(department); }
    byDept.get(department)!.tests.push(test);
  };

  const items = Array.isArray(testBreakdown) ? (testBreakdown as BreakdownItem[]) : [];
  if (items.length > 0) {
    for (const it of items) {
      const name = (it.canonical_name || it.raw || "").trim();
      if (!name) continue;
      const { department, workflow } = categoryToDepartment(it.category, departments);
      const raw = (it.raw || "").trim();
      const sub = raw && raw.toLowerCase() !== name.toLowerCase() ? `as written: ${raw}` : null;
      push(department, workflow, { name, sub });
    }
  } else {
    // No structured breakdown — split the free-text tests string and route each.
    const names = testsString.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      const { department, workflow } = categoryToDepartment(name, departments);
      push(department, workflow, { name });
    }
  }

  return order.map((department) => {
    const g = byDept.get(department)!;
    return { department, hint: WORKFLOW_HINT[g.workflow] ?? "", tests: g.tests };
  });
}

function nairaTotal(testBreakdown: unknown): string | null {
  const items = Array.isArray(testBreakdown) ? (testBreakdown as BreakdownItem[]) : [];
  let sum = 0; let any = false;
  for (const it of items) {
    if (typeof it.unit_price === "number" && it.unit_price > 0) { sum += it.unit_price; any = true; }
  }
  return any ? `₦${Math.round(sum).toLocaleString("en-NG")}` : null;
}

/** Render the patient visit checklist for a request into a branded PDF buffer.
 *  Returns null if the request is not found or belongs to a different lab. */
export async function renderVisitChecklistPdf(
  requestId: string,
  labId: string,
): Promise<{ buffer: Buffer; code: string } | null> {
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: {
      lab_id: true, code: true, tests: true, test_breakdown: true, is_paid: true,
      patient_name: true, patient_age: true, sex: true, patient_phone: true, patient_email: true,
      doctor_prefix: true, doctor_name: true, doctor_hospital: true,
    },
  });
  if (!request || request.lab_id !== labId) return null;

  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    select: { name: true, logo_url: true, address: true, phones: true },
  });
  if (!lab) return null;

  const deptRows = await prisma.labDepartment.findMany({
    where: { lab_id: labId, is_active: true },
    orderBy: { sort_order: "asc" },
    select: { name: true, workflow: true, categories: true },
  });
  const departments: DepartmentConfig[] = deptRows.length
    ? deptRows.map((r) => ({ name: r.name, workflow: r.workflow as WorkflowType, categories: Array.isArray(r.categories) ? (r.categories as string[]) : [] }))
    : DEFAULT_DEPARTMENTS;

  const phones = Array.isArray(lab.phones) ? (lab.phones as string[]).filter(Boolean).join(" · ") : "";
  const doctorName = [request.doctor_prefix, request.doctor_name].filter(Boolean).join(" ").trim() || null;

  const buffer = await renderToBuffer(
    VisitChecklistPdf({
      labName: lab.name,
      labLogo: await logoDataUrl(lab.logo_url),
      labAddress: lab.address || null,
      labPhones: phones || null,
      code: request.code,
      generatedAt: new Date(),
      patientName: request.patient_name,
      patientAge: request.patient_age,
      patientSex: request.sex,
      patientPhone: request.patient_phone,
      patientEmail: request.patient_email,
      doctorName,
      doctorHospital: request.doctor_hospital,
      groups: buildGroups(request.test_breakdown, request.tests, departments),
      totalLabel: request.is_paid ? nairaTotal(request.test_breakdown) : null,
      verifiedBy: null,
    }),
  );
  return { buffer: buffer as Buffer, code: request.code };
}
