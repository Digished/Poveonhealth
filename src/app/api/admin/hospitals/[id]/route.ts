export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { hospitalAccountCreated } from "@/lib/email/templates";
import { isKnownSpecialty } from "@/lib/specialties";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** PATCH /api/admin/hospitals/[id] — update hospital details / referral account */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.hospital.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Hospital not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.city !== undefined) data.city = body.city?.trim() || null;
  if (body.state !== undefined) data.state = body.state?.trim() || null;
  if (body.address !== undefined) data.address = body.address?.trim() || null;
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
  if (body.email !== undefined) data.email = body.email?.trim() ? String(body.email).trim().toLowerCase() : null;
  if (body.is_active !== undefined) data.is_active = Boolean(body.is_active);
  if (body.specialties !== undefined) {
    if (!Array.isArray(body.specialties)) {
      return NextResponse.json({ error: "Specialties must be a list" }, { status: 400 });
    }
    data.specialties = body.specialties.map((s: unknown) => String(s).trim()).filter(isKnownSpecialty);
  }

  const hospital = await prisma.hospital.update({ where: { id }, data });

  // Newly assigned login email — send the portal invite
  const newEmail = typeof data.email === "string" ? data.email : null;
  if (newEmail && newEmail !== existing.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
    resend.emails
      .send({
        from: FROM_ADDRESS,
        to: newEmail,
        subject: "Your hospital is now on the Poveon referral network",
        html: hospitalAccountCreated({
          hospitalName: hospital.name,
          email: newEmail,
          loginUrl: `${appUrl}/hospital-login`,
        }),
      })
      .then(({ error }) => { if (error) console.error("[admin/hospitals/:id] invite email:", JSON.stringify(error)); })
      .catch((e) => console.error("[admin/hospitals/:id] invite email error:", e));
  }

  return NextResponse.json({ success: true, hospital });
}

/** DELETE /api/admin/hospitals/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.hospital.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
