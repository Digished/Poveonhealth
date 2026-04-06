export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, labSender } from "@/lib/email/resend";
import { doctorPatientArrived } from "@/lib/email/templates";
import { logApiCall } from "@/lib/api-logger";
import { getLabAuth } from "@/lib/lab-auth";
import { resolveTests } from "@/lib/resolve-tests";

const RetrieveSchema = z.object({
  code: z.string().min(1).max(50).transform((s) => s.trim().toUpperCase()),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const parsed = RetrieveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid code format" },
        { status: 400 }
      );
    }

    const { code } = parsed.data;

    // Authenticate lab user/member/API key
    const auth = await getLabAuth(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    if (!auth.permissions.can_mark_seen) {
      return NextResponse.json(
        { success: false, error: "You do not have permission to retrieve patients" },
        { status: 403 }
      );
    }

    // Look up the request by code
    const req = await prisma.request.findUnique({
      where: { code },
      include: { lab: { select: { name: true, address: true, notification_email: true } } },
    });

    if (!req) {
      return NextResponse.json(
        { success: false, error: "No request found with that code" },
        { status: 404 }
      );
    }

    // Verify code belongs to this lab
    if (req.lab_id !== auth.lab_id) {
      return NextResponse.json(
        { success: false, error: "This request does not belong to your laboratory." },
        { status: 403 }
      );
    }

    const brand = req.lab.notification_email ? { name: req.lab.name } : undefined;

    // Move incoming → seen: calculate commission, deduct from wallet, notify doctor
    if (req.status === "incoming") {
      // Resolve tests against lab catalog to calculate commission
      type BreakdownItem = { source?: string; poveon_fee?: number | null; unit_price?: number };
      let breakdown: BreakdownItem[] = [];
      const testsString = req.tests && req.tests !== "See attached image" ? req.tests : null;
      if (testsString) {
        try { breakdown = await resolveTests(testsString, req.lab_id) as BreakdownItem[]; } catch { /* non-fatal */ }
      } else if (Array.isArray(req.test_breakdown)) {
        breakdown = req.test_breakdown as BreakdownItem[];
      }

      let poveonFee = 0;
      let labRevenue = 0;
      for (const item of breakdown) {
        if (item.source === "lab_catalog") {
          poveonFee  += Number(item.poveon_fee ?? 0);
          labRevenue += Number(item.unit_price ?? 0);
        }
      }

      // Deduct commission from wallet — balance allowed to go negative (lab owes Poveon).
      // Only skipped if the lab has no wallet provisioned at all.
      let isPaidToPoveon = false;
      if (poveonFee > 0) {
        try {
          const wallet = await prisma.labWallet.findUnique({ where: { lab_id: req.lab_id } });
          if (wallet) {
            await prisma.labWallet.update({
              where: { lab_id: req.lab_id },
              data: { balance: { decrement: poveonFee } },
            });
            isPaidToPoveon = true;
          } else {
            console.log(`[retrieve] no wallet for lab ${req.lab_id} — commission outstanding`);
          }
        } catch (err) {
          console.error("[retrieve] wallet deduction failed:", err);
          // Non-fatal — request still moves to seen, commission tracked as outstanding
        }
      }

      // Update request: status, commission fields, and breakdown
      const breakdownJson = breakdown.length > 0 ? JSON.stringify(breakdown) : null;
      if (breakdownJson) {
        await prisma.$executeRawUnsafe(
          `UPDATE requests SET status='seen', seen_at=NOW(), test_breakdown=$1::jsonb, poveon_amount=$2, lab_revenue_amount=$3, is_paid_to_poveon=$4 WHERE id=$5`,
          breakdownJson, poveonFee, labRevenue, isPaidToPoveon, req.id,
        );
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE requests SET status='seen', seen_at=NOW(), poveon_amount=$1, lab_revenue_amount=$2, is_paid_to_poveon=$3 WHERE id=$4`,
          poveonFee, labRevenue, isPaidToPoveon, req.id,
        );
      }

      if (req.doctor_email) resend.emails.send({
        from: labSender(req.lab),
        to: req.doctor_email,
        subject: `Patient Arrived — ${req.patient_name ?? "Patient"} is at ${req.lab.name}`,
        html: doctorPatientArrived({
          doctorName: req.doctor_name,
          patientName: req.patient_name ?? "Patient",
          labName: req.lab.name,
          code: req.code,
          brand,
        }),
      }).then(({ error }) => { if (error) console.error("[email] patient arrived:", JSON.stringify(error)); })
        .catch((e) => console.error("[email] patient arrived error:", e));

      logApiCall({ method: "POST", path: "/api/requests/retrieve", status: 200, lab_id: req.lab_id, duration_ms: Date.now() - start });
      return NextResponse.json({ success: true, request: { ...req, status: "seen" } });
    }

    logApiCall({ method: "POST", path: "/api/requests/retrieve", status: 200, lab_id: req.lab_id, duration_ms: Date.now() - start });
    return NextResponse.json({ success: true, request: req });
  } catch (error) {
    console.error("Retrieve error:", error);
    logApiCall({ method: "POST", path: "/api/requests/retrieve", status: 500, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
