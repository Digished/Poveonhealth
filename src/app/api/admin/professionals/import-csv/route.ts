export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin(request: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

interface ImportRow {
  email: string;
  prefix?: string;
  full_name: string;
  phone?: string;
  hospitals?: string[];
  bank_name?: string;
  account_number?: string;
  account_name?: string;
}

/**
 * POST /api/admin/professionals/import-csv
 *
 * Body: { rows: ImportRow[] }  (client parses CSV and sends clean rows)
 *
 * Deduplication rules:
 *  - Email exists + claimed=true  → skip (active account; never touch)
 *  - Email exists + claimed=false → skip (already pre-created; avoid overwrite)
 *  - Email not found              → create
 *
 * Returns:
 *  { created, skipped_claimed, skipped_duplicate, errors: [{row, email, reason}] }
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const body = await request.json();
    const rows: ImportRow[] = body.rows ?? [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 });
    }

    // Normalise all emails up front
    const normalised = rows.map((r, i) => ({
      ...r,
      email: r.email.trim().toLowerCase(),
      _idx: i + 2, // 1-based row, +1 for header = +2
    }));

    // Deduplicate within the uploaded file itself (first occurrence wins)
    const seen = new Set<string>();
    const deduped: typeof normalised = [];
    const inFileDups: { row: number; email: string; reason: string }[] = [];
    for (const r of normalised) {
      if (seen.has(r.email)) {
        inFileDups.push({ row: r._idx, email: r.email, reason: "Duplicate email within the file" });
      } else {
        seen.add(r.email);
        deduped.push(r);
      }
    }

    // Fetch existing profiles for all emails in one query
    const emails = deduped.map((r) => r.email);
    const existing = await prisma.doctorProfile.findMany({
      where: { email: { in: emails } },
      select: { email: true, claimed: true },
    });
    const existingMap = new Map(existing.map((e) => [e.email, e.claimed]));

    // Partition rows
    const toCreate: typeof deduped = [];
    const skipped_claimed: { row: number; email: string; reason: string }[] = [];
    const skipped_duplicate: { row: number; email: string; reason: string }[] = [];

    for (const row of deduped) {
      if (existingMap.has(row.email)) {
        const claimed = existingMap.get(row.email);
        if (claimed) {
          skipped_claimed.push({ row: row._idx, email: row.email, reason: "Active account — profile managed by the doctor" });
        } else {
          skipped_duplicate.push({ row: row._idx, email: row.email, reason: "Profile already exists (unclaimed)" });
        }
      } else {
        toCreate.push(row);
      }
    }

    // Auto-create any new hospitals referenced in the rows being imported
    const allHospitalNames = Array.from(
      new Set(
        deduped
          .flatMap((r) => (Array.isArray(r.hospitals) ? r.hospitals : []))
          .map((h) => h.trim())
          .filter(Boolean)
      )
    );
    let hospitals_created = 0;
    if (allHospitalNames.length > 0) {
      const existingHospitals = await prisma.hospital.findMany({
        where: { name: { in: allHospitalNames } },
        select: { name: true },
      });
      const existingNames = new Set(existingHospitals.map((h) => h.name));
      const newNames = allHospitalNames.filter((n) => !existingNames.has(n));
      if (newNames.length > 0) {
        const result = await prisma.hospital.createMany({
          data: newNames.map((name) => ({ name })),
          skipDuplicates: true,
        });
        hospitals_created = result.count;
      }
    }

    // Batch create — skipDuplicates as a safety net
    let created = 0;
    const createErrors: { row: number; email: string; reason: string }[] = [];

    if (toCreate.length > 0) {
      try {
        const result = await prisma.doctorProfile.createMany({
          data: toCreate.map((r) => ({
            email: r.email,
            prefix: r.prefix?.trim() || null,
            full_name: r.full_name.trim(),
            phone: r.phone?.trim() || null,
            hospitals: Array.isArray(r.hospitals) ? r.hospitals.filter(Boolean) : [],
            bank_name: r.bank_name?.trim() || null,
            account_number: r.account_number?.trim() || null,
            account_name: r.account_name?.trim() || null,
            claimed: false,
          })),
          skipDuplicates: true,
        });
        created = result.count;
      } catch (err) {
        // If batch fails (shouldn't happen after dedup), fall back to individual creates
        console.error("[import-csv] Batch create failed, attempting individual:", err);
        for (const r of toCreate) {
          try {
            await prisma.doctorProfile.create({
              data: {
                email: r.email,
                prefix: r.prefix?.trim() || null,
                full_name: r.full_name.trim(),
                phone: r.phone?.trim() || null,
                hospitals: Array.isArray(r.hospitals) ? r.hospitals.filter(Boolean) : [],
                bank_name: r.bank_name?.trim() || null,
                account_number: r.account_number?.trim() || null,
                account_name: r.account_name?.trim() || null,
                claimed: false,
              },
            });
            created++;
          } catch (rowErr) {
            createErrors.push({ row: r._idx, email: r.email, reason: "Database error" });
            console.error("[import-csv] Row error:", r.email, rowErr);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      created,
      hospitals_created,
      skipped_claimed: skipped_claimed.length,
      skipped_duplicate: skipped_duplicate.length + inFileDups.length,
      errors: [...createErrors, ...skipped_claimed, ...skipped_duplicate, ...inFileDups],
    });
  } catch (err) {
    console.error("[import-csv] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
