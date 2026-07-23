export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { logLabActivity } from "@/lib/lab-activity";
import * as xlsx from "xlsx";

const PARTNER_TYPES = ["hmo", "hospital", "company"] as const;
type PartnerType = (typeof PARTNER_TYPES)[number];

type ParsedRow = {
  row: number; // 1-based row number in the sheet, for error reporting
  type: PartnerType | null;
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};

type SkippedRow = { row: number; name: string; reason: string };

/** Maps free-form spreadsheet values ("HMOs", "Clinic", "Insurance"…) onto a partner type. */
function normaliseType(raw: string): PartnerType | null {
  const t = raw.toLowerCase().trim();
  if (!t) return null;
  if (t.includes("hmo") || t.includes("insur")) return "hmo";
  if (t.includes("hospital") || t.includes("clinic") || t.includes("medical cent")) return "hospital";
  if (t.includes("company") || t.includes("corporate") || t.includes("employer") || t.includes("business")) return "company";
  return null;
}

function normaliseHeaders(headers: string[]): string[] {
  return headers.map((h) => String(h).toLowerCase().trim().replace(/"/g, "").replace(/[\s-]+/g, "_"));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function rowsFromSheetData(rawRows: unknown[][]): ParsedRow[] {
  if (rawRows.length < 2) return [];
  const headers = normaliseHeaders(rawRows[0].map((c) => String(c ?? "")));

  const nameIdx = headers.findIndex((h) =>
    ["name", "partner", "partner_name", "organisation", "organization", "org_name"].includes(h)
  );
  if (nameIdx === -1) return [];

  const typeIdx    = headers.findIndex((h) => ["type", "partner_type", "category", "kind"].includes(h));
  const contactIdx = headers.findIndex((h) => ["contact_name", "contact", "contact_person"].includes(h));
  const phoneIdx   = headers.findIndex((h) => ["phone", "phone_number", "tel", "telephone", "mobile"].includes(h));
  const emailIdx   = headers.findIndex((h) => ["email", "email_address", "mail"].includes(h));
  const addressIdx = headers.findIndex((h) => ["address", "location"].includes(h));
  const notesIdx   = headers.findIndex((h) => ["notes", "note", "comments", "comment", "remarks", "remark"].includes(h));

  const rows: ParsedRow[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const cols = rawRows[i].map((c) => String(c ?? "").trim().replace(/^"|"$/g, ""));
    const name = cols[nameIdx]?.trim();
    if (!name) continue;
    const cell = (idx: number) => (idx !== -1 ? cols[idx]?.trim() || undefined : undefined);
    rows.push({
      row: i + 1,
      type: typeIdx !== -1 ? normaliseType(cols[typeIdx] ?? "") : null,
      name,
      contact_name: cell(contactIdx),
      phone: cell(phoneIdx),
      email: cell(emailIdx),
      address: cell(addressIdx),
      notes: cell(notesIdx),
    });
  }
  return rows;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return rowsFromSheetData(lines.map((l) => l.split(",").map((c) => c.trim())));
}

function parseExcel(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = xlsx.read(buffer, { type: "array" });
  const allRows: ParsedRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const raw = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    allRows.push(...rowsFromSheetData(raw as unknown[][]));
  }
  return allRows;
}

/**
 * POST /api/admin/labs/[id]/partners/upload
 * Bulk-import a lab's partners (HMOs, hospitals, companies) from a CSV/Excel
 * spreadsheet, on behalf of the lab. Admin only.
 *
 * Columns: name (required); type, contact_name, phone, email, address, notes (optional).
 * Rows without a recognisable type fall back to the `default_type` form field.
 * Existing partners (matched case-insensitively on type + name) are updated,
 * not duplicated.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

  const lab = await prisma.lab.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!lab) return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });

  const defaultTypeRaw = String(formData.get("default_type") ?? "");
  const defaultType = (PARTNER_TYPES as readonly string[]).includes(defaultTypeRaw)
    ? (defaultTypeRaw as PartnerType)
    : null;

  let rows: ParsedRow[];
  try {
    const filename = file.name.toLowerCase();
    if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      rows = parseExcel(await file.arrayBuffer());
    } else {
      rows = parseCsv(await file.text());
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: `Parse error: ${String(error)}` }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { success: false, error: "No valid rows found. The sheet needs a header row with a 'name' column. Optional columns: type, contact_name, phone, email, address, notes." },
      { status: 400 }
    );
  }

  // Existing partners for duplicate matching (case-insensitive on type + name)
  const existing = await prisma.labPartner.findMany({
    where: { lab_id: lab.id },
    select: { id: true, type: true, name: true },
  });
  const keyOf = (type: string, name: string) => `${type}|${name.toLowerCase().trim()}`;
  const existingMap = new Map(existing.map((p) => [keyOf(p.type, p.name), p.id]));

  const skipped: SkippedRow[] = [];
  const seenInFile = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const type = row.type ?? defaultType;
    if (!type) {
      skipped.push({ row: row.row, name: row.name, reason: "Unrecognised partner type (use hmo, hospital or company, or pick a default type)" });
      continue;
    }

    const key = keyOf(type, row.name);
    if (seenInFile.has(key)) {
      skipped.push({ row: row.row, name: row.name, reason: "Duplicate row in file" });
      continue;
    }
    seenInFile.add(key);

    const email = row.email && EMAIL_RE.test(row.email) ? row.email : null;
    // Only overwrite detail fields the spreadsheet actually provides
    const details = {
      ...(row.contact_name ? { contact_name: row.contact_name } : {}),
      ...(row.phone ? { phone: row.phone } : {}),
      ...(email ? { email } : {}),
      ...(row.address ? { address: row.address } : {}),
      ...(row.notes ? { notes: row.notes } : {}),
    };

    const existingId = existingMap.get(key);
    if (existingId) {
      await prisma.labPartner.update({
        where: { id: existingId },
        data: { ...details, is_active: true },
      });
      updated++;
    } else {
      await prisma.labPartner.create({
        data: { lab_id: lab.id, type, name: row.name, ...details },
      });
      created++;
    }
  }

  if (created + updated > 0) {
    logLabActivity({
      lab_id: lab.id,
      actor_email: admin.email ?? "admin@poveon.com",
      actor_role: "poveon_admin",
      action: "partners_uploaded",
      detail: `${created} added, ${updated} updated from spreadsheet (by Poveon admin)`,
    });
  }

  return NextResponse.json({
    success: true,
    summary: { total: rows.length, created, updated, skipped },
  });
}
