export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, patient_phone, patient_email } = body as {
      requestId?: string;
      patient_phone?: string;
      patient_email?: string;
    };

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: "requestId is required" },
        { status: 400 }
      );
    }

    if (!patient_phone || typeof patient_phone !== "string" || patient_phone.trim() === "") {
      return NextResponse.json(
        { success: false, error: "patient_phone is required" },
        { status: 400 }
      );
    }

    if (!patient_email || typeof patient_email !== "string" || patient_email.trim() === "") {
      return NextResponse.json(
        { success: false, error: "patient_email is required" },
        { status: 400 }
      );
    }

    // Authenticate lab user/member/API key
    const auth = await getLabAuth(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    // Fetch the request to verify ownership
    const req = await prisma.request.findUnique({
      where: { id: requestId },
      select: { id: true, lab_id: true },
    });

    if (!req) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 }
      );
    }

    if (req.lab_id !== auth.lab_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized to update this request" },
        { status: 403 }
      );
    }

    await prisma.request.update({
      where: { id: requestId },
      data: {
        patient_phone: patient_phone.trim(),
        patient_email: patient_email.trim(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update contact error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
