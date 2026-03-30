export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

// GET /api/lab/agreement-status — returns whether the lab has a signed agreement
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ signed: null }, { status: 401 });

  const agreement = await prisma.labAgreement.findFirst({
    where: { lab_id: auth.lab_id },
    orderBy: { signed_at: "desc" },
    select: { id: true, version: true, signed_at: true, signer_name: true },
  });

  return NextResponse.json({
    signed: !!agreement,
    latest: agreement ?? null,
  });
}
