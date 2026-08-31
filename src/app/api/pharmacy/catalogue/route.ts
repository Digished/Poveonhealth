export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPharmacyFromRequest } from "@/lib/consult";
import { parseMedSheet } from "@/lib/med-sheet";
import { priceMedication } from "@/lib/med-pricing";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * A pharmacy's price list.
 *
 * GET    — the catalogue, with what each row means for a member and for them.
 * POST   — upload a spreadsheet. `?preview=1` parses and prices without
 *          writing, which is how the pharmacy sees what a file will do before
 *          it does it.
 * PATCH  — correct one row by hand.
 * DELETE — retire one row.
 */

export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  const pharmacy = await getPharmacyFromRequest(req);
  if (!pharmacy) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const [meds, batches] = await Promise.all([
    prisma.pharmacyMedication.findMany({
      where: { pharmacy_id: pharmacy.id, active: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.pharmacyPriceBatch.findMany({
      where: { pharmacy_id: pharmacy.id },
      orderBy: { created_at: "desc" },
      take: 5,
    }),
  ]);

  const defaultMargin = Number(pharmacy.margin_percent ?? 5);

  return NextResponse.json({
    success: true,
    margin_percent: defaultMargin,
    medications: meds.map((m) => {
      const priced = priceMedication({
        listNaira: Number(m.list_price),
        concessionNaira: Number(m.concession),
        marginPercent: Number(m.margin_percent ?? defaultMargin),
      });
      return {
        id: m.id,
        name: m.name,
        strength: m.strength,
        form: m.form,
        pack: m.pack,
        list_price: Number(m.list_price),
        concession: Number(m.concession),
        margin_percent: Number(m.margin_percent ?? defaultMargin),
        in_stock: m.in_stock,
        updated_at: m.updated_at,
        // What each party actually sees, so nobody has to do the sum by hand.
        member_pays: priced.memberNaira,
        you_receive: priced.pharmacyNaira,
        member_saves: priced.savingNaira,
        saving_percent: priced.savingPercent,
        clamped: priced.clamped,
      };
    }),
    batches: batches.map((b) => ({
      id: b.id,
      filename: b.filename,
      rows_written: b.rows_written,
      rows_skipped: b.rows_skipped,
      created_at: b.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  const pharmacy = await getPharmacyFromRequest(req);
  if (!pharmacy) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a spreadsheet to upload." }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "That file is over 5MB. Split it and upload in parts." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseMedSheet(buffer);
  } catch {
    return NextResponse.json(
      { error: "We could not read that file. Save it as .xlsx or .csv and try again." },
      { status: 400 }
    );
  }

  const defaultMargin = Number(pharmacy.margin_percent ?? 5);
  const priced = parsed.rows.map((r) => ({
    ...r,
    ...priceMedication({
      listNaira: r.listPrice,
      concessionNaira: r.concession,
      marginPercent: defaultMargin,
    }),
  }));

  const preview = req.nextUrl.searchParams.get("preview") === "1";
  if (preview) {
    // Nothing is written. The pharmacy sees the first rows priced out, every
    // problem with its row number, and how many rows would be new against how
    // many would be updated.
    const keys = priced.map((r) => r.key);
    const existing = keys.length
      ? await prisma.pharmacyMedication.findMany({
          where: { pharmacy_id: pharmacy.id, key: { in: keys } },
          select: { key: true },
        })
      : [];
    const known = new Set(existing.map((e) => e.key));

    return NextResponse.json({
      success: true,
      preview: true,
      seen: parsed.seen,
      mapping: parsed.mapping,
      problems: parsed.problems,
      would_add: priced.filter((r) => !known.has(r.key)).length,
      would_update: priced.filter((r) => known.has(r.key)).length,
      clamped: priced.filter((r) => r.clamped).length,
      margin_percent: defaultMargin,
      rows: priced.slice(0, 40).map((r) => ({
        row: r.row,
        name: r.name,
        strength: r.strength,
        form: r.form,
        pack: r.pack,
        list_price: r.listPrice,
        concession: r.concession,
        from_percent: r.concessionWasPercent,
        in_stock: r.inStock,
        member_pays: r.memberNaira,
        you_receive: r.pharmacyNaira,
        member_saves: r.savingNaira,
        clamped: r.clamped,
        is_new: !known.has(r.key),
      })),
    });
  }

  if (priced.length === 0) {
    return NextResponse.json(
      { error: "Nothing in that file could be read as a medication.", problems: parsed.problems },
      { status: 400 }
    );
  }

  const batchId = randomUUID();

  // Upserted one at a time rather than in a single transaction: a price list is
  // hundreds of rows, and a transaction that large will time out on a serverless
  // connection. A part-applied upload is recoverable — the batch records what
  // landed, and re-uploading the same file is idempotent because the key is
  // stable.
  let written = 0;
  const failures: { row: number; reason: string }[] = [];
  for (const r of priced) {
    try {
      await prisma.pharmacyMedication.upsert({
        where: { pharmacy_id_key: { pharmacy_id: pharmacy.id, key: r.key } },
        create: {
          pharmacy_id: pharmacy.id,
          name: r.name,
          strength: r.strength,
          form: r.form,
          pack: r.pack,
          key: r.key,
          list_price: r.listPrice,
          concession: r.concession,
          in_stock: r.inStock,
          notes: r.notes,
          batch_id: batchId,
        },
        update: {
          name: r.name,
          strength: r.strength,
          form: r.form,
          pack: r.pack,
          list_price: r.listPrice,
          concession: r.concession,
          in_stock: r.inStock,
          notes: r.notes,
          active: true,
          batch_id: batchId,
        },
      });
      written += 1;
    } catch {
      failures.push({ row: r.row, reason: "Could not be saved" });
    }
  }

  const problems = [...parsed.problems, ...failures];
  await prisma.pharmacyPriceBatch.create({
    data: {
      id: batchId,
      pharmacy_id: pharmacy.id,
      filename: file.name.slice(0, 200),
      rows_seen: parsed.seen,
      rows_written: written,
      rows_skipped: problems.length,
      problems: problems.slice(0, 200),
      uploaded_by: pharmacy.email,
    },
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    written,
    seen: parsed.seen,
    problems,
    clamped: priced.filter((r) => r.clamped).length,
  });
}

const PatchSchema = z.object({
  id: z.string().min(1),
  list_price: z.coerce.number().min(0).max(10_000_000).optional(),
  concession: z.coerce.number().min(0).max(10_000_000).optional(),
  in_stock: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  const pharmacy = await getPharmacyFromRequest(req);
  if (!pharmacy) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change." }, { status: 400 });
  }
  const { id, ...changes } = parsed.data;

  const med = await prisma.pharmacyMedication.findUnique({ where: { id } });
  if (!med || med.pharmacy_id !== pharmacy.id) {
    return NextResponse.json({ error: "Medication not found." }, { status: 404 });
  }

  const list = changes.list_price ?? Number(med.list_price);
  const concession = changes.concession ?? Number(med.concession);
  if (concession > list) {
    return NextResponse.json(
      { error: "The discount cannot be more than the price." },
      { status: 400 }
    );
  }

  await prisma.pharmacyMedication.update({ where: { id }, data: changes });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  const pharmacy = await getPharmacyFromRequest(req);
  if (!pharmacy) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });

  // Retired rather than deleted: orders reference it, and a price someone
  // already paid must stay readable.
  const { count } = await prisma.pharmacyMedication.updateMany({
    where: { id, pharmacy_id: pharmacy.id },
    data: { active: false },
  });
  if (!count) return NextResponse.json({ error: "Medication not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
