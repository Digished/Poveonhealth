export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { derivePrefixFromName } from "@/lib/code-generator";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { labAccountCreated } from "@/lib/email/templates";

const CreateLabSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  address: z.string().min(3).max(500),
  description: z.string().max(1000).optional(),
  phones: z.array(z.object({ number: z.string().min(1), label: z.string() })).optional(),
  notification_email: z.string().email().optional(),
  tempPassword: z.string().min(8).max(100).optional(),
});

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate and verify admin
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
    if (!adminRecord) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = CreateLabSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, address, description, phones, notification_email } = parsed.data;
    const tempPassword = parsed.data.tempPassword ?? generateTempPassword();

    // Derive a unique prefix
    let prefix = derivePrefixFromName(name);
    for (let attempt = 0; attempt <= 9; attempt++) {
      const candidate = attempt === 0 ? prefix : `${prefix}${attempt}`;
      const existing = await prisma.lab.findUnique({ where: { prefix: candidate }, select: { id: true } });
      if (!existing) { prefix = candidate; break; }
      if (attempt === 9) {
        return NextResponse.json(
          { success: false, error: "Could not generate a unique prefix for this lab name" },
          { status: 500 }
        );
      }
    }

    // Create lab record via Prisma
    let newLab: { id: string; name: string; prefix: string; email: string };
    try {
      newLab = await prisma.lab.create({
        data: { name, prefix, address, email, ...(description ? { description } : {}), ...(phones ? { phones } : {}), ...(notification_email ? { notification_email } : {}) },
        select: { id: true, name: true, prefix: true, email: true },
      });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr?.code === "P2002") {
        return NextResponse.json(
          { success: false, error: "A lab with that email already exists" },
          { status: 409 }
        );
      }
      throw err;
    }

    // Create Supabase Auth user for this lab (still uses Supabase for auth only)
    const supabaseAdmin = createAdminClient();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role: "lab", lab_id: newLab.id, lab_name: name },
    });

    if (authError || !authData.user) {
      await prisma.lab.delete({ where: { id: newLab.id } });
      return NextResponse.json(
        { success: false, error: "Failed to create lab user account" },
        { status: 500 }
      );
    }

    // Link auth user → lab in Prisma
    try {
      await prisma.labUser.create({
        data: { user_id: authData.user.id, lab_id: newLab.id },
      });
    } catch {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      await prisma.lab.delete({ where: { id: newLab.id } });
      return NextResponse.json(
        { success: false, error: "Failed to link lab account" },
        { status: 500 }
      );
    }

    // Send credentials email
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://poveon.vercel.app"}/lab-login`;
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Welcome to Poveon — Lab Account Created",
      html: labAccountCreated({ labName: name, email, tempPassword, loginUrl }),
    });

    return NextResponse.json({ success: true, lab: newLab, tempPassword });
  } catch (error) {
    console.error("Create lab error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
