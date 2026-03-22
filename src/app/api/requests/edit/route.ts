import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Doctors can only edit tests, diagnosis, and schedule — not patient or doctor info
const EditRequestSchema = z.object({
  requestId: z.string().uuid(),
  tests: z.string().min(2).max(2000),
  diagnosis: z.string().max(2000).optional().or(z.literal("")),
  schedule: z.enum(["today", "this_week", "this_month", "not_sure"]).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    // Authenticate via doctor session cookie
    const token = request.cookies.get("doc_token")?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    const session = await prisma.doctorSession.findUnique({ where: { id: token } });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ success: false, error: "Session expired. Please log in again." }, { status: 401 });
    }

    const body = await request.json();
    const parsed = EditRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Fetch the existing request and verify ownership + editability
    const existing = await prisma.request.findUnique({
      where: { id: data.requestId },
      select: { id: true, status: true, doctor_email: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Request not found." }, { status: 404 });
    }

    if (existing.doctor_email !== session.doctor_email) {
      return NextResponse.json({ success: false, error: "You do not have permission to edit this request." }, { status: 403 });
    }

    if (existing.status !== "incoming") {
      return NextResponse.json(
        { success: false, error: "This request can no longer be edited — it has already been processed by the laboratory." },
        { status: 409 }
      );
    }

    // Apply the update — only tests, diagnosis, and schedule
    await prisma.request.update({
      where: { id: data.requestId },
      data: {
        tests: data.tests,
        diagnosis: data.diagnosis || null,
        schedule: data.schedule || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[requests/edit]", err);
    return NextResponse.json({ success: false, error: "An unexpected error occurred." }, { status: 500 });
  }
}
