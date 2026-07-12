export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

/**
 * GET /api/lab/staff
 * Lightweight staff directory for result sign-off pickers (analyst / verifier).
 * Returns each member's id, display name, email and signature URL. Requires
 * can_view_requests (any result-entry staff can pick a signer).
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await prisma.labMember.findMany({
    where: { lab_id: auth.lab_id },
    select: { id: true, name: true, email: true, signature_url: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  const staff = members.map((m) => ({
    id: m.id,
    name: m.name || m.email || "Unnamed",
    email: m.email,
    has_signature: !!m.signature_url,
  }));

  return NextResponse.json({ staff });
}
