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

    // Move incoming → seen: resolve breakdown if not already stored, mark seen, notify doctor
    if (req.status === "incoming") {
      type BreakdownItem = { source?: string; unit_price?: number };
      let breakdown: BreakdownItem[] = [];
      if (Array.isArray(req.test_breakdown) && req.test_breakdown.length > 0) {
        breakdown = req.test_breakdown as BreakdownItem[];
      } else {
        const testsString = req.tests && req.tests !== "See attached image" ? req.tests : null;
        if (testsString) {
          try { breakdown = await resolveTests(testsString, req.lab_id) as BreakdownItem[]; } catch { /* non-fatal */ }
        }
      }

      // Update request: status and breakdown (no commission deduction)
      const breakdownJson = breakdown.length > 0 ? JSON.stringify(breakdown) : null;
      if (breakdownJson) {
        await prisma.$executeRawUnsafe(
          `UPDATE requests SET status='seen', seen_at=NOW(), test_breakdown=$1::jsonb WHERE id=$2`,
          breakdownJson, req.id,
        );
      } else {
        await prisma.$executeRawUnsafe(
          `UPDATE requests SET status='seen', seen_at=NOW() WHERE id=$1`,
          req.id,
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
