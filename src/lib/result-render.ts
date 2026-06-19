import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { ResultReportPdf, ResultParam } from "@/lib/result-report-pdf";

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

/** Render a stored RequestResult into a branded PDF buffer. Returns null if not found / wrong lab. */
export async function renderResultPdf(resultId: string, labId: string): Promise<{ buffer: Buffer; code: string } | null> {
  const result = await prisma.requestResult.findUnique({
    where: { id: resultId },
    include: {
      lab: { select: { name: true } },
      request: { select: { code: true, patient_name: true, patient_age: true, sex: true, patient_phone: true } },
    },
  });
  if (!result || result.lab_id !== labId) return null;

  const params = (Array.isArray(result.values) ? result.values : []) as ResultParam[];
  const buffer = await renderToBuffer(
    ResultReportPdf({
      labName: result.lab.name,
      code: result.request.code,
      reportedAt: result.verified_at ?? new Date(),
      department: result.department,
      patientName: result.request.patient_name,
      patientAge: result.request.patient_age,
      patientSex: result.request.sex,
      patientPhone: result.request.patient_phone,
      parameters: params,
      comment: result.comment,
      verifiedBy: result.verified_by,
      verifiedAt: result.verified_at,
    })
  );
  return { buffer: buffer as Buffer, code: result.request.code };
}
