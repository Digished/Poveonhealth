import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/labs/[labId]/branches — public: returns branch labs for a parent lab
// Returns the same shape as before (id, name, address, phones, is_main)
// but name/address/phones now come from the linked branch_lab record
export async function GET(
  _req: NextRequest,
  { params }: { params: { labId: string } }
) {
  try {
    const branches = await prisma.labBranch.findMany({
      where: { lab_id: params.labId },
      include: {
        branch_lab: {
          select: { id: true, name: true, address: true, phones: true, whatsapp: true },
        },
      },
      orderBy: [{ is_main: "desc" }],
    });

    // Filter out stale rows that have no linked branch_lab (migrated from old schema)
    const result = branches
      .filter((b) => b.branch_lab !== null)
      .map((b) => ({
        id: b.id,
        branch_lab_id: b.branch_lab_id,
        name: b.branch_lab!.name,
        address: b.branch_lab!.address,
        phones: b.branch_lab!.phones as string[],
        whatsapp: b.branch_lab!.whatsapp,
        is_main: b.is_main,
      }));

    return NextResponse.json({ branches: result });
  } catch {
    return NextResponse.json({ branches: [] }, { status: 500 });
  }
}
