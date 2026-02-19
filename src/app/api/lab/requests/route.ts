import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Authenticated endpoint — returns requests for the current lab user
export async function GET() {
  try {
    const authClient = await createServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    if (user.user_metadata?.role !== "lab") {
      return NextResponse.json(
        { success: false, error: "Lab access required" },
        { status: 403 }
      );
    }

    const labUser = await prisma.labUser.findUnique({
      where: { user_id: user.id },
    });

    if (!labUser) {
      return NextResponse.json(
        { success: false, error: "Lab account not found" },
        { status: 404 }
      );
    }

    const requests = await prisma.request.findMany({
      where: { lab_id: labUser.lab_id },
      include: { lab: { select: { name: true, address: true } } },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ success: true, requests });
  } catch (error) {
    console.error("Lab requests fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load requests" },
      { status: 500 }
    );
  }
}
