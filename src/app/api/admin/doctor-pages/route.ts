export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isEncounterReady } from "@/lib/doctor-encounter";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * GET /api/admin/doctor-pages — doctors who have set up an encounter page,
 * with readiness, pricing, patient counts, and encounter/revenue totals.
 */
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let profiles: Awaited<ReturnType<typeof prisma.doctorProfile.findMany>> = [];
  try {
    profiles = await prisma.doctorProfile.findMany({
      where: { OR: [{ consultation_fee: { not: null } }, { encounter_slug: { not: null } }] },
      orderBy: { updated_at: "desc" },
      take: 1000,
    });
  } catch {
    return NextResponse.json({ success: true, stats: { total: 0, live: 0 }, doctors: [] });
  }

  const emails = profiles.map((p) => p.email);
  const [patientGroups, encounterGroups] = await Promise.all([
    prisma.doctorPatient.groupBy({ by: ["doctor_email"], where: { doctor_email: { in: emails } }, _count: { _all: true } }).catch(() => []),
    prisma.encounter.groupBy({
      by: ["doctor_email"],
      where: { doctor_email: { in: emails }, status: { not: "awaiting_payment" } },
      _count: { _all: true },
      _sum: { doctor_share: true, amount_paid: true },
    }).catch(() => []),
  ]);
  const patientCount = new Map(patientGroups.map((g) => [g.doctor_email, g._count._all]));
  const encMap = new Map(encounterGroups.map((g) => [g.doctor_email, { count: g._count._all, doctor: Number(g._sum.doctor_share ?? 0), gross: Number(g._sum.amount_paid ?? 0) }]));

  const doctors = profiles.map((p) => {
    const enc = encMap.get(p.email);
    return {
      email: p.email,
      name: [p.prefix, p.full_name].filter(Boolean).join(" ").trim() || p.email,
      specialty: p.specialty ?? null,
      slug: p.encounter_slug ?? null,
      ready: isEncounterReady(p),
      consultation_fee: p.consultation_fee != null ? Number(p.consultation_fee) : null,
      has_subaccount: !!p.paystack_subaccount_code,
      patient_count: patientCount.get(p.email) ?? 0,
      encounter_count: enc?.count ?? 0,
      gross: enc?.gross ?? 0,
      doctor_earned: enc?.doctor ?? 0,
      updated_at: p.updated_at,
    };
  });

  return NextResponse.json({
    success: true,
    stats: { total: doctors.length, live: doctors.filter((d) => d.ready).length },
    doctors,
  });
}
