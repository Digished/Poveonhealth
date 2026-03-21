import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { code, schedule } = await req.json();

    if (!code || !schedule) {
      return NextResponse.json({ error: "Code and schedule are required." }, { status: 400 });
    }

    const request = await prisma.request.findUnique({ where: { code } });
    if (!request) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    await prisma.request.update({
      where: { code },
      data: { schedule },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[requests/update-schedule]", err);
    return NextResponse.json({ error: "Failed to update schedule. Please try again." }, { status: 500 });
  }
}
