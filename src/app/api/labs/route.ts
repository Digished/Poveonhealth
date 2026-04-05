export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Public endpoint — returns visible labs for the doctor form dropdown.
// force-dynamic so admin changes (add/hide/delete) are reflected immediately.
export async function GET() {
  try {
    const labs = await prisma.lab.findMany({
      where: { hidden: false, search_hidden: false },
      select: {
        id: true,
        name: true,
        slug: true,
        prefix: true,
        address: true,
        logo_url: true,
        phones: true,
        whatsapp: true,
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(
      { success: true, labs },
      {
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Labs fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load laboratories" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
