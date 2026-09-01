export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resolveAccountName } from "@/lib/paystack-bank";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const BodySchema = z.object({
  bank_code: z.string().trim().min(1),
  account_number: z.string().trim().regex(/^\d{10}$/, "An account number is 10 digits"),
});

/**
 * POST /api/admin/pharmacies/resolve-account — who owns this account?
 *
 * Behind the admin gate on purpose: resolving an account number to a name is
 * a lookup of somebody's banking details, and it should take an admin session
 * to do it, not merely knowing the URL.
 *
 * Advisory. The same check runs again when the pharmacy is saved, so nothing
 * depends on the browser having asked first.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid account." },
      { status: 400 }
    );
  }

  const resolved = await resolveAccountName(parsed.data.bank_code, parsed.data.account_number);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.message, reason: resolved.reason },
      { status: resolved.reason === "not_found" ? 422 : 503 }
    );
  }
  return NextResponse.json({ success: true, account_name: resolved.name });
}
