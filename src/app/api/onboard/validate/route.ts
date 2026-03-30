export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/onboard/validate?token=xxx
// Public — returns lab info for the signing page if the token is valid
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const invite = await prisma.labAgreementInvite.findUnique({
    where: { token },
    include: {
      lab: {
        select: {
          id: true,
          name: true,
          address: true,
          email: true,
          logo_url: true,
          agreements: {
            select: { id: true, version: true, signed_at: true },
            orderBy: { signed_at: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!invite) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (invite.used) {
    return NextResponse.json({ error: "This link has already been used" }, { status: 410 });
  }
  if (invite.expires_at < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  return NextResponse.json({
    valid: true,
    lab: {
      id: invite.lab.id,
      name: invite.lab.name,
      address: invite.lab.address,
      email: invite.lab.email,
      logo_url: invite.lab.logo_url,
    },
    already_signed: invite.lab.agreements.length > 0,
    custom_content: invite.custom_content ?? null,
  });
}
