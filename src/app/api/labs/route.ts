import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public endpoint — returns all labs for the doctor form dropdown
export async function GET() {
  try {
    const labs = await prisma.lab.findMany({
      select: { id: true, name: true, prefix: true, addresses: true, email: true },
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
