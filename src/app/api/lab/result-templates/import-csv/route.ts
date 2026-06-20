export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

/**
 * POST /api/lab/result-templates/import-csv
 * Body: { csv: string }
 *
 * Each row is one parameter; rows are grouped into templates by the "template"
 * column. Recognised columns (case-insensitive, any order):
 *   template, department, parameter, unit, reference_range, group
 * Existing templates with the same name are replaced (re-uploading the same
 * sheet is idempotent). Requires can_manage_templates.
 */

interface Param { name: string; unit: string; reference_range: string; group: string }

/** Minimal CSV line splitter that respects double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const csv: string = typeof body?.csv === "string" ? body.csv : "";
  if (!csv.trim()) return NextResponse.json({ error: "No CSV content provided" }, { status: 400 });

  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return NextResponse.json({ error: "CSV needs a header row and at least one data row" }, { status: 400 });

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const idx = (...names: string[]) => {
    for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i; }
    return -1;
  };
  const tIdx = idx("template", "template_name", "report", "name");
  const pIdx = idx("parameter", "param", "analyte", "test");
  if (tIdx === -1 || pIdx === -1) {
    return NextResponse.json({ error: "CSV must include 'template' and 'parameter' columns" }, { status: 400 });
  }
  const dIdx = idx("department", "dept");
  const uIdx = idx("unit", "units");
  const rIdx = idx("reference_range", "reference", "range", "ref_range");
  const gIdx = idx("group", "section");

  // Group rows into templates (preserving first-seen order).
  const order: string[] = [];
  const map = new Map<string, { name: string; department: string; params: Param[] }>();
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const tName = (cols[tIdx] ?? "").trim();
    const pName = (cols[pIdx] ?? "").trim();
    if (!tName || !pName) continue;
    const key = tName.toLowerCase();
    if (!map.has(key)) {
      order.push(key);
      map.set(key, { name: tName, department: (dIdx !== -1 ? cols[dIdx] : "")?.trim() || "", params: [] });
    }
    map.get(key)!.params.push({
      name: pName,
      unit: (uIdx !== -1 ? cols[uIdx] : "")?.trim() || "",
      reference_range: (rIdx !== -1 ? cols[rIdx] : "")?.trim() || "",
      group: (gIdx !== -1 ? cols[gIdx] : "")?.trim() || "",
    });
  }

  if (order.length === 0) return NextResponse.json({ error: "No valid template rows found" }, { status: 400 });

  let created = 0;
  let replaced = 0;
  for (const key of order) {
    const t = map.get(key)!;
    const parameters = t.params.map((p) => ({ name: p.name, unit: p.unit, reference_range: p.reference_range, group: p.group }));
    const existing = await prisma.labResultTemplate.findFirst({ where: { lab_id: auth.lab_id, name: t.name } });
    if (existing) {
      await prisma.labResultTemplate.update({
        where: { id: existing.id },
        data: { department: t.department || null, parameters },
      });
      replaced++;
    } else {
      await prisma.labResultTemplate.create({
        data: { lab_id: auth.lab_id, name: t.name, department: t.department || null, parameters, created_by: auth.actor_email ?? null },
      });
      created++;
    }
  }

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "result_templates_imported", detail: `${created} created, ${replaced} updated` });
  }

  return NextResponse.json({ success: true, created, replaced, templates: order.length });
}
