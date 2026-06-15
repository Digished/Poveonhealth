export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { broadcastEmail } from "@/lib/email/templates";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const BodySchema = z.object({
  subject: z.string().trim().min(2).max(200),
  html: z.string().trim().min(2).max(50_000),
  emails: z.array(z.string().email()).min(1).max(5000),
});

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** POST /api/admin/bulk-email/send — send a branded broadcast to selected addresses. */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    const { subject, html } = parsed.data;
    // Dedupe + normalise
    const emails = Array.from(new Set(parsed.data.emails.map((e) => e.trim().toLowerCase())));
    const fullHtml = broadcastEmail({ bodyHtml: html });

    let sent = 0;
    let failed = 0;
    // Each recipient gets their own message (individual "to") so addresses aren't exposed.
    for (const batch of chunk(emails, 100)) {
      const payload = batch.map((to) => ({ from: FROM_ADDRESS, to, subject, html: fullHtml }));
      try {
        const { error } = await resend.batch.send(payload);
        if (error) { failed += batch.length; console.error("[bulk-email/send] batch error:", JSON.stringify(error)); }
        else sent += batch.length;
      } catch (e) {
        failed += batch.length;
        console.error("[bulk-email/send] batch threw:", e);
      }
    }

    return NextResponse.json({ success: true, sent, failed, total: emails.length });
  } catch (err) {
    console.error("[bulk-email/send]", err);
    return NextResponse.json({ error: "Failed to send. Please try again." }, { status: 500 });
  }
}
