export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorFromRequest, getDoctorMemberScope } from "@/lib/hmo/auth";

// All members this doctor monitors (HMO coverage ∪ individual assignments),
// with latest readings and open-alert counts for the panel table.
export async function GET(req: NextRequest) {
  try {
    const doctor = await getDoctorFromRequest(req);
    if (!doctor) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { hmoIds, directMemberIds } = await getDoctorMemberScope(doctor.doctor_email);
    if (hmoIds.length === 0 && directMemberIds.length === 0) {
      return NextResponse.json({ success: true, patients: [] });
    }

    const members = await prisma.hmoMember.findMany({
      where: {
        active: true,
        OR: [
          ...(hmoIds.length > 0 ? [{ hmo_id: { in: hmoIds } }] : []),
          ...(directMemberIds.length > 0 ? [{ id: { in: directMemberIds } }] : []),
        ],
      },
      include: { hmo: { select: { name: true, code: true } } },
      orderBy: { full_name: "asc" },
    });
    const memberIds = members.map((m) => m.id);

    const [latestReadings, openAlerts] = await Promise.all([
      prisma.hmoVitalsReading.findMany({
        where: { member_id: { in: memberIds } },
        orderBy: { recorded_at: "desc" },
      }),
      prisma.hmoVitalsAlert.groupBy({
        by: ["member_id"],
        where: { member_id: { in: memberIds }, status: "open" },
        _count: { id: true },
      }),
    ]);

    // First reading per (member, type) in the desc-ordered list = latest
    const latestBp = new Map<string, (typeof latestReadings)[number]>();
    const latestSugar = new Map<string, (typeof latestReadings)[number]>();
    for (const r of latestReadings) {
      const map = r.type === "bp" ? latestBp : latestSugar;
      if (!map.has(r.member_id)) map.set(r.member_id, r);
    }
    const alertMap = new Map(openAlerts.map((a) => [a.member_id, a._count.id]));

    return NextResponse.json({
      success: true,
      patients: members.map((m) => ({
        id: m.id,
        full_name: m.full_name,
        email: m.email,
        policy_number: m.policy_number,
        phone: m.phone,
        date_of_birth: m.date_of_birth,
        sex: m.sex,
        hmo_name: m.hmo.name,
        flagged: m.flagged,
        flag_note: m.flag_note,
        latest_bp: latestBp.get(m.id) ?? null,
        latest_sugar: latestSugar.get(m.id) ?? null,
        open_alerts: alertMap.get(m.id) ?? 0,
      })),
    });
  } catch (err) {
    console.error("[doc-login/monitoring/patients]", err);
    return NextResponse.json({ error: "Failed to load patients." }, { status: 500 });
  }
}
