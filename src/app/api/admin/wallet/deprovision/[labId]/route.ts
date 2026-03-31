export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const client = await createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  return await prisma.adminUser.findUnique({ where: { user_id: user.id } }) ? user : null;
}

/**
 * POST /api/admin/wallet/deprovision/[labId]
 *
 * Clears the DVA (Dedicated Virtual Account) details and Paystack customer ID
 * from the lab's wallet so a new DVA can be provisioned.
 * Balance and credit history are preserved.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { labId: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const wallet = await prisma.labWallet.findUnique({ where: { lab_id: params.labId } });
  if (!wallet) return NextResponse.json({ error: "No wallet found for this lab." }, { status: 404 });

  await prisma.labWallet.update({
    where: { lab_id: params.labId },
    data: {
      paystack_customer_id: null,
      dva_bank_name:        null,
      dva_account_number:   null,
      dva_account_name:     null,
    },
  });

  return NextResponse.json({ success: true });
}
