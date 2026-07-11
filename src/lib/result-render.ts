import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { ResultReportPdf, ResultParam, ResultSection } from "@/lib/result-report-pdf";

/** Compute a High/Low flag for a value against a reference range like "10-20", "< 5", "> 3". */
export function computeFlag(value: string | undefined, range: string | undefined): string {
  if (!value || !range) return "";
  const num = parseFloat(String(value).replace(/[^0-9.\-]/g, ""));
  if (Number.isNaN(num)) return "";
  const r = range.replace(/\s/g, "");
  let m = r.match(/^(-?\d+(?:\.\d+)?)[-–to]+(-?\d+(?:\.\d+)?)$/i);
  if (m) {
    const lo = parseFloat(m[1]); const hi = parseFloat(m[2]);
    if (num < lo) return "L";
    if (num > hi) return "H";
    return "";
  }
  m = r.match(/^[<≤]=?(-?\d+(?:\.\d+)?)$/);
  if (m) return num > parseFloat(m[1]) ? "H" : "";
  m = r.match(/^[>≥]=?(-?\d+(?:\.\d+)?)$/);
  if (m) return num < parseFloat(m[1]) ? "L" : "";
  return "";
}

/** First phone from the lab's `phones` JSON array. Entries may be strings or { number }. */
function firstPhone(phones: unknown): string | null {
  if (!Array.isArray(phones) || phones.length === 0) return null;
  const p = phones[0];
  if (typeof p === "string") return p;
  if (p && typeof p === "object" && "number" in p) return String((p as { number: unknown }).number);
  return null;
}

/** Fetch a logo URL and return it as a data URI (so @react-pdf never makes a network call at render time). Best-effort. */
async function fetchLogoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/png";
    if (!/^image\/(png|jpe?g|gif|webp)/.test(ct)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 2_000_000) return null; // guard against oversized logos
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type LabBrand = { name: string; logo_url: string | null; address: string; phones: unknown; email: string };

async function labBrandProps(lab: LabBrand) {
  return {
    labName: lab.name,
    labLogo: await fetchLogoDataUrl(lab.logo_url),
    labAddress: lab.address || null,
    labPhone: firstPhone(lab.phones),
    labEmail: lab.email || null,
  };
}

const LAB_SELECT = { name: true, logo_url: true, address: true, phones: true, email: true } as const;

/** Render a single stored RequestResult into a branded PDF buffer. Returns null if not found / wrong lab. */
export async function renderResultPdf(resultId: string, labId: string): Promise<{ buffer: Buffer; code: string } | null> {
  const result = await prisma.requestResult.findUnique({
    where: { id: resultId },
    include: {
      lab: { select: LAB_SELECT },
      request: { select: { code: true, patient_name: true, patient_age: true, sex: true, patient_phone: true } },
    },
  });
  if (!result || result.lab_id !== labId) return null;

  const params = (Array.isArray(result.values) ? result.values : []) as ResultParam[];
  const brand = await labBrandProps(result.lab);
  const buffer = await renderToBuffer(
    ResultReportPdf({
      ...brand,
      code: result.request.code,
      reportedAt: result.verified_at ?? new Date(),
      patientName: result.request.patient_name,
      patientAge: result.request.patient_age,
      patientSex: result.request.sex,
      patientPhone: result.request.patient_phone,
      sections: [{ parameters: params, comment: result.comment, verifiedBy: result.verified_by, verifiedAt: result.verified_at }],
    })
  );
  return { buffer: buffer as Buffer, code: result.request.code };
}

/**
 * Render MULTIPLE results (same request) into one combined branded PDF — each
 * result becomes its own titled section. Returns null if none belong to the lab
 * or they span different requests.
 */
export async function renderResultsPdf(resultIds: string[], labId: string): Promise<{ buffer: Buffer; code: string } | null> {
  if (resultIds.length === 0) return null;
  const results = await prisma.requestResult.findMany({
    where: { id: { in: resultIds }, lab_id: labId },
    include: {
      lab: { select: LAB_SELECT },
      request: { select: { id: true, code: true, patient_name: true, patient_age: true, sex: true, patient_phone: true } },
    },
    orderBy: { created_at: "asc" },
  });
  if (results.length === 0) return null;
  const req = results[0].request;
  if (!results.every((r) => r.request.id === req.id)) return null; // must be one patient/request

  // Resolve template names for section titles.
  const templateIds = Array.from(new Set(results.map((r) => r.template_id).filter(Boolean))) as string[];
  const templates = templateIds.length
    ? await prisma.labResultTemplate.findMany({ where: { id: { in: templateIds } }, select: { id: true, name: true } })
    : [];
  const tName = new Map(templates.map((t) => [t.id, t.name]));

  const sections: ResultSection[] = results.map((r) => ({
    title: (r.template_id && tName.get(r.template_id)) || r.department || "Result",
    parameters: (Array.isArray(r.values) ? r.values : []) as ResultParam[],
    comment: r.comment,
    verifiedBy: r.verified_by,
    verifiedAt: r.verified_at,
  }));

  const brand = await labBrandProps(results[0].lab);
  const buffer = await renderToBuffer(
    ResultReportPdf({
      ...brand,
      code: req.code,
      reportedAt: new Date(),
      patientName: req.patient_name,
      patientAge: req.patient_age,
      patientSex: req.sex,
      patientPhone: req.patient_phone,
      sections,
    })
  );
  return { buffer: buffer as Buffer, code: req.code };
}
