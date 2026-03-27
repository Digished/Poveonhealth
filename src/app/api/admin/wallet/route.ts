export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/wallet — all lab wallets with DVA + balance summary */
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const wallets = await prisma.labWallet.findMany({
    include: {
      lab: { select: { id: true, name: true, email: true, logo_url: true } },
    },
    orderBy: { updated_at: "desc" },
  });

  return NextResponse.json({
    wallets: wallets.map((w) => ({
      lab_id: w.lab_id,
      lab_name: w.lab.name,
      lab_email: w.lab.email,
      logo_url: w.lab.logo_url,
      balance: Number(w.balance),
      dva_provisioned: !!w.dva_account_number,
      dva_bank_name: w.dva_bank_name,
      dva_account_number: w.dva_account_number,
      dva_account_name: w.dva_account_name,
      updated_at: w.updated_at,
    })),
  });
}
