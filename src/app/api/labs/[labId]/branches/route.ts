import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { labId: string } }
) {
  try {
    const branches = await prisma.labBranch.findMany({
      where: { lab_id: params.labId },
      select: { id: true, name: true, address: true, phones: true, is_main: true },
      orderBy: [{ is_main: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ branches });
  } catch {
    return NextResponse.json({ branches: [] }, { status: 500 });
  }
}
