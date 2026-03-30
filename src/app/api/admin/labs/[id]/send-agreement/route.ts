export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerClient } from "@/lib/supabase/server";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { agreementInviteEmail } from "@/lib/email/templates";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Admin auth
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
    if (!adminRecord) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const customContent: string | null = body.custom_content || null;

    const lab = await prisma.lab.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, email: true },
    });
    if (!lab) return NextResponse.json({ error: "Lab not found" }, { status: 404 });

    // Expire any existing unused invites for this lab
    await prisma.labAgreementInvite.updateMany({
      where: { lab_id: lab.id, used: false },
      data: { expires_at: new Date() },
    });

    // Create a fresh invite (expires in 30 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const invite = await prisma.labAgreementInvite.create({
      data: {
        lab_id: lab.id,
        sent_by: user.email ?? "admin",
        expires_at: expiresAt,
        custom_content: customContent,
      },
    });

    // Derive base URL from request headers (Vercel-safe)
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      (host ? `${proto}://${host}` : "https://poveonhealth.com");
    const signingUrl = `${baseUrl}/onboard/${invite.token}`;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: lab.email,
      subject: `Action Required: Sign your Poveon Partnership Agreement`,
      html: agreementInviteEmail({
        labName: lab.name,
        signingUrl,
        expiresAt: expiresAt.toDateString(),
      }),
    });

    return NextResponse.json({ success: true, invite_id: invite.id, expires_at: expiresAt });
  } catch (err) {
    console.error("[send-agreement]", err);
    return NextResponse.json({ error: "Failed to send agreement invite" }, { status: 500 });
  }
}
