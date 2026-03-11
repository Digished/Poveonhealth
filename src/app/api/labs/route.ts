import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Never cache — labs list must always be fresh so newly added labs appear immediately
export const dynamic = "force-dynamic";

// Public endpoint — returns visible labs for the doctor form dropdown
export async function GET() {
  try {
    const labs = await prisma.lab.findMany({
      where: { hidden: false },
      select: { id: true, name: true, prefix: true, address: true, description: true, phones: true, email: true, logo_url: true, hidden: true, created_at: true, service_categories: true, certifications: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, labs });
  } catch (error) {
    console.error("Labs fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load laboratories" },
      { status: 500 }
    );
  }
}
