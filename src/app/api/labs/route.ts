import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Never cache — labs list must always be fresh so newly added labs appear immediately
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Public endpoint — returns visible labs for the doctor form dropdown
export async function GET() {
  try {
    const labs = await prisma.lab.findMany({
      where: { hidden: false },
      select: {
        id: true,
        name: true,
        slug: true,
        prefix: true,
        address: true,
        description: true,
        logo_url: true,
        phones: true,
        whatsapp: true,
        service_categories: true,
        certifications: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ success: true, labs }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Labs fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load laboratories" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
