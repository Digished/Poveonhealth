import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * Server-side password update after OTP verification.
 * Requires that a LabOtp record for this email was recently used (within last 5 min)
 * to confirm identity was already verified.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const { email: rawEmail, password } = parsed.data;
    const email = rawEmail.trim().toLowerCase();

    // Confirm a used OTP exists within the last 5 minutes (proof of identity)
    const recentUsed = await prisma.labOtp.findFirst({
      where: {
        email,
        used: true,
        created_at: { gt: new Date(Date.now() - 5 * 60 * 1000) },
      },
      orderBy: { created_at: "desc" },
    });

    if (!recentUsed) {
      return NextResponse.json({ error: "Identity verification expired. Please restart the reset process." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { data: users } = await adminSupabase.auth.admin.listUsers();
    const user = users?.users?.find(
      (u) => u.email?.toLowerCase() === email &&
        (u.user_metadata?.role === "lab" || u.user_metadata?.role === "lab_member")
    );
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const { error: updateErr } = await adminSupabase.auth.admin.updateUserById(user.id, { password });
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lab/set-password]", err);
    return NextResponse.json({ error: "Failed to update password." }, { status: 500 });
  }
}
