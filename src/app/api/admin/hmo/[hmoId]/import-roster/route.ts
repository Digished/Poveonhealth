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

interface RosterRow {
  email: string;
  policy_number: string;
  full_name: string;
  phone?: string;
  date_of_birth?: string;
  sex?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/admin/hmo/[hmoId]/import-roster
 *
 * Body: { rows: RosterRow[] }  (client parses CSV/xlsx and sends clean rows)
 *
 * Dedup rules (per HMO):
 *  - policy_number or email already on this HMO's roster → skip
 *  - duplicate within the file (first occurrence wins)   → skip
 *
 * Returns { created, skipped_duplicate, errors: [{row, email, reason}] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { hmoId: string } }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const hmo = await prisma.hmo.findUnique({ where: { id: params.hmoId } });
    if (!hmo) return NextResponse.json({ error: "HMO not found" }, { status: 404 });

    const body = await request.json();
    const rows: RosterRow[] = body.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 });
    }
    if (rows.length > 5000) {
      return NextResponse.json({ error: "Too many rows — upload at most 5000 at a time." }, { status: 400 });
    }

    const errors: { row: number; email: string; reason: string }[] = [];

    // Normalise + validate each row; row numbers are 1-based + header
    const normalised = rows.map((r, i) => ({
      email: String(r.email ?? "").trim().toLowerCase(),
      policy_number: String(r.policy_number ?? "").trim(),
      full_name: String(r.full_name ?? "").trim(),
      phone: String(r.phone ?? "").trim() || null,
      date_of_birth: String(r.date_of_birth ?? "").trim() || null,
      sex: String(r.sex ?? "").trim().toLowerCase() || null,
      _idx: i + 2,
    }));

    const valid: typeof normalised = [];
    for (const r of normalised) {
      if (!EMAIL_RE.test(r.email)) {
        errors.push({ row: r._idx, email: r.email, reason: "Invalid email address" });
      } else if (!r.policy_number) {
        errors.push({ row: r._idx, email: r.email, reason: "Missing policy number" });
      } else if (!r.full_name) {
        errors.push({ row: r._idx, email: r.email, reason: "Missing full name" });
      } else if (r.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(r.date_of_birth)) {
        errors.push({ row: r._idx, email: r.email, reason: "Date of birth must be YYYY-MM-DD" });
      } else if (r.sex && !["male", "female", "other"].includes(r.sex)) {
        errors.push({ row: r._idx, email: r.email, reason: "Sex must be male, female or other" });
      } else {
        valid.push(r);
      }
    }

    // Dedup within the file on policy number and email (first occurrence wins)
    const seenPolicy = new Set<string>();
    const seenEmail = new Set<string>();
    const deduped: typeof valid = [];
    for (const r of valid) {
      const policyKey = r.policy_number.toLowerCase();
      if (seenPolicy.has(policyKey)) {
        errors.push({ row: r._idx, email: r.email, reason: "Duplicate policy number within the file" });
      } else if (seenEmail.has(r.email)) {
        errors.push({ row: r._idx, email: r.email, reason: "Duplicate email within the file" });
      } else {
        seenPolicy.add(policyKey);
        seenEmail.add(r.email);
        deduped.push(r);
      }
    }

    // Skip rows already on this HMO's roster
    const existing = await prisma.hmoMember.findMany({
      where: {
        hmo_id: hmo.id,
        OR: [
          { policy_number: { in: deduped.map((r) => r.policy_number), mode: "insensitive" } },
          { email: { in: deduped.map((r) => r.email) } },
        ],
      },
      select: { email: true, policy_number: true },
    });
    const existingPolicies = new Set(existing.map((e) => e.policy_number.toLowerCase()));
    const existingEmails = new Set(existing.map((e) => e.email));

    const toCreate: typeof deduped = [];
    let skipped_duplicate = 0;
    for (const r of deduped) {
      if (existingPolicies.has(r.policy_number.toLowerCase()) || existingEmails.has(r.email)) {
        skipped_duplicate++;
        errors.push({ row: r._idx, email: r.email, reason: "Already on this HMO's roster" });
      } else {
        toCreate.push(r);
      }
    }

    let created = 0;
    if (toCreate.length > 0) {
      const result = await prisma.hmoMember.createMany({
        data: toCreate.map((r) => ({
          hmo_id: hmo.id,
          email: r.email,
          policy_number: r.policy_number,
          full_name: r.full_name,
          phone: r.phone,
          date_of_birth: r.date_of_birth,
          sex: r.sex,
        })),
        skipDuplicates: true,
      });
      created = result.count;
    }

    return NextResponse.json({
      success: true,
      created,
      skipped_duplicate,
      errors,
    });
  } catch (err) {
    console.error("[admin/hmo/import-roster]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
