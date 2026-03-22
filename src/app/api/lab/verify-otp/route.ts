import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";

const Schema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(6),
  newPassword: z.string().min(8).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const { email: rawEmail, code, newPassword } = parsed.data;
    const email = rawEmail.trim().toLowerCase();
    const codeHash = createHash("sha256").update(code).digest("hex");

    // Find a valid, unused OTP
    const otp = await prisma.labOtp.findFirst({
      where: {
        email,
        code_hash: codeHash,
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: "desc" },
    });

    if (!otp) {
      return NextResponse.json({ error: "Invalid or expired code." }, { status: 401 });
    }

    // Mark OTP as used
    await prisma.labOtp.update({ where: { id: otp.id }, data: { used: true } });

    // If a new password was provided, update it now via admin client
    if (newPassword) {
      const adminSupabase = createAdminClient();
      const { data: users } = await adminSupabase.auth.admin.listUsers();
      const user = users?.users?.find(
        (u) => u.email?.toLowerCase() === email &&
          (u.user_metadata?.role === "lab" || u.user_metadata?.role === "lab_member")
      );
      if (!user) {
        return NextResponse.json({ error: "Account not found." }, { status: 404 });
      }
      const { error: updateErr } = await adminSupabase.auth.admin.updateUserById(user.id, { password: newPassword });
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lab/verify-otp]", err);
    return NextResponse.json({ error: "Failed to verify code." }, { status: 500 });
  }
}
