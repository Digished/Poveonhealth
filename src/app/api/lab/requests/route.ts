export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    if (!auth.permissions.can_view_requests) return NextResponse.json({ success: false, error: "Your role does not permit viewing requests" }, { status: 403 });

    // The lab name/address is the same for every row (it's the caller's own lab),
    // so we don't join it onto each request — the dashboard doesn't use it and it
    // only bloats the payload.
    const requests = await prisma.request.findMany({
      where: { lab_id: auth.lab_id },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ success: true, requests });
  } catch (error) {
    console.error("Lab requests fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load requests" }, { status: 500 });
  }
}
