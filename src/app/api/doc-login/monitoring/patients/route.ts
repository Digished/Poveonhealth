export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorFromRequest, getDoctorMemberScope } from "@/lib/hmo/auth";

/** The only reading fields the monitoring panel renders. */
type LatestReading = {
  member_id: string;
  type: string;
  systolic: number | null;
  diastolic: number | null;
  glucose_mg_dl: unknown;
  recorded_at: Date;
};

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
      return NextResponse.json({ success: true, patients: [], count: 0 });
    }

    const scopeWhere = {
      active: true,
      OR: [
        ...(hmoIds.length > 0 ? [{ hmo_id: { in: hmoIds } }] : []),
        ...(directMemberIds.length > 0 ? [{ id: { in: directMemberIds } }] : []),
      ],
    };

    // `?count=1` — the dashboard only needs to know whether the Monitoring tab
    // should appear. Building the full panel (every member plus every vitals
    // reading they ever recorded) just to read `.length` was the single most
    // expensive request on first load.
    if (req.nextUrl.searchParams.get("count") === "1") {
      const count = await prisma.hmoMember.count({ where: scopeWhere });
      return NextResponse.json({ success: true, count, patients: [] });
    }

    const members = await prisma.hmoMember.findMany({
      where: scopeWhere,
      include: { hmo: { select: { name: true, code: true } } },
      orderBy: { full_name: "asc" },
    });
    const memberIds = members.map((m) => m.id);

    // Only the newest reading per (member, type) is shown. Pulling the whole
    // history back and filtering in JS made this the slowest call in the
    // portal; `DISTINCT ON` lets Postgres answer it straight off the
    // (member_id, type, recorded_at) index.
    const [latestReadings, openAlerts] = await Promise.all([
      prisma.$queryRaw<LatestReading[]>`
        SELECT DISTINCT ON (member_id, type)
          member_id, type, systolic, diastolic, glucose_mg_dl, recorded_at
        FROM hmo_vitals_readings
        WHERE member_id = ANY(${memberIds}::text[])
        ORDER BY member_id, type, recorded_at DESC
      `,
      prisma.hmoVitalsAlert.groupBy({
        by: ["member_id"],
        where: { member_id: { in: memberIds }, status: "open" },
        _count: { id: true },
      }),
    ]);

    const latestBp = new Map<string, LatestReading>();
    const latestSugar = new Map<string, LatestReading>();
    for (const r of latestReadings) {
      (r.type === "bp" ? latestBp : latestSugar).set(r.member_id, r);
    }
    const alertMap = new Map(openAlerts.map((a) => [a.member_id, a._count.id]));

    return NextResponse.json({
      success: true,
      count: members.length,
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
