export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorFromRequest, getDoctorMemberScope } from "@/lib/hmo/auth";

// Alert feed across all members this doctor monitors (open first).
export async function GET(req: NextRequest) {
  try {
    const doctor = await getDoctorFromRequest(req);
    if (!doctor) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { hmoIds, directMemberIds } = await getDoctorMemberScope(doctor.doctor_email);
    if (hmoIds.length === 0 && directMemberIds.length === 0) {
      return NextResponse.json({ success: true, alerts: [] });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // "open" | "acknowledged" | null (all)
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

    const alerts = await prisma.hmoVitalsAlert.findMany({
      where: {
        ...(status === "open" || status === "acknowledged" ? { status } : {}),
        member: {
          active: true,
          OR: [
            ...(hmoIds.length > 0 ? [{ hmo_id: { in: hmoIds } }] : []),
            ...(directMemberIds.length > 0 ? [{ id: { in: directMemberIds } }] : []),
          ],
        },
      },
      include: {
        member: { select: { id: true, full_name: true, policy_number: true, hmo: { select: { name: true } } } },
        reading: true,
      },
      orderBy: [{ status: "desc" }, { created_at: "desc" }], // "open" > "acknowledged"
      take: limit,
    });

    return NextResponse.json({ success: true, alerts });
  } catch (err) {
    console.error("[doc-login/monitoring/alerts]", err);
    return NextResponse.json({ error: "Failed to load alerts." }, { status: 500 });
  }
}
