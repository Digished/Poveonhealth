export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * GET /api/admin/encounters — paid doctor encounters, platform revenue split,
 * and per-doctor breakdown. Excludes abandoned (awaiting_payment) checkouts.
 */
export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const visible = { status: { not: "awaiting_payment" } };

  const encounters = await prisma.encounter.findMany({
    where: {
      ...visible,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" as const } },
              { patient_name: { contains: q, mode: "insensitive" as const } },
              { patient_email: { contains: q, mode: "insensitive" as const } },
              { doctor_email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { created_at: "desc" },
    take: 500,
  });

  // Resolve doctor display names in one shot
  const doctorEmails = Array.from(new Set(encounters.map((e) => e.doctor_email)));
  const profiles = await prisma.doctorProfile.findMany({
    where: { email: { in: doctorEmails } },
    select: { email: true, prefix: true, full_name: true, specialty: true },
  });
  const nameByEmail = new Map(
    profiles.map((p) => [p.email, [p.prefix, p.full_name].filter(Boolean).join(" ").trim() || p.email])
  );

  let gross = 0;
  let poveon = 0;
  let doctorTotal = 0;
  const perDoctor = new Map<string, { doctor_email: string; doctor_name: string; gross: number; poveon: number; doctor_share: number; count: number }>();

  for (const e of encounters) {
    const amt = Number(e.amount_paid ?? 0);
    const pv = Number(e.poveon_share ?? 0);
    const dr = Number(e.doctor_share ?? 0);
    gross += amt; poveon += pv; doctorTotal += dr;

    const key = e.doctor_email;
    const row = perDoctor.get(key) ?? {
      doctor_email: key,
      doctor_name: nameByEmail.get(key) ?? key,
      gross: 0, poveon: 0, doctor_share: 0, count: 0,
    };
    row.gross += amt; row.poveon += pv; row.doctor_share += dr; row.count += 1;
    perDoctor.set(key, row);
  }

  return NextResponse.json({
    success: true,
    stats: {
      gross: Math.round(gross),
      poveon_revenue: Math.round(poveon),
      doctor_payouts: Math.round(doctorTotal),
      encounter_count: encounters.length,
      doctor_count: perDoctor.size,
    },
    perDoctor: Array.from(perDoctor.values())
      .map((r) => ({ ...r, gross: Math.round(r.gross), poveon: Math.round(r.poveon), doctor_share: Math.round(r.doctor_share) }))
      .sort((a, b) => b.gross - a.gross),
    encounters: encounters.map((e) => ({
      id: e.id,
      code: e.code,
      doctor_email: e.doctor_email,
      doctor_name: nameByEmail.get(e.doctor_email) ?? e.doctor_email,
      patient_name: e.patient_name,
      patient_email: e.patient_email,
      patient_phone: e.patient_phone,
      plan_type: e.plan_type,
      status: e.status,
      amount_paid: Number(e.amount_paid ?? 0),
      poveon_share: Number(e.poveon_share ?? 0),
      doctor_share: Number(e.doctor_share ?? 0),
      paid_at: e.paid_at,
      created_at: e.created_at,
    })),
  });
}
