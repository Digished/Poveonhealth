export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const BASE   = "https://api.paystack.co";
const SECRET = process.env.PAYSTACK_SECRET_KEY!;

async function verifyAdmin() {
  const client = await createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  return await prisma.adminUser.findUnique({ where: { user_id: user.id } }) ? user : null;
}

async function paystackPost(path: string, body: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * POST /api/admin/wallet/regenerate/[labId]
 * Body: { phone?: string }
 *
 * Forces creation of a new dedicated virtual account for the lab.
 * - Reuses existing Paystack customer if one exists.
 * - If no customer exists, phone is required to create one.
 * - Clears old DVA fields and saves the new account details.
 */
export async function POST(req: NextRequest, { params }: { params: { labId: string } }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone ?? "").replace(/\D/g, "").replace(/^234/, "0");

  const lab = await prisma.lab.findUnique({
    where: { id: params.labId },
    select: { id: true, name: true, email: true },
  });
  if (!lab) return NextResponse.json({ error: "Lab not found." }, { status: 404 });
  if (!lab.email) return NextResponse.json({ error: "Lab has no email." }, { status: 422 });

  const wallet = await prisma.labWallet.findUnique({ where: { lab_id: lab.id } });

  const nameParts = lab.name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName  = nameParts.slice(1).join(" ") || "Lab";

  let customerCode = wallet?.paystack_customer_id ?? null;

  // Create a new Paystack customer if none exists
  if (!customerCode) {
    if (!phone) {
      return NextResponse.json({ error: "Phone number is required to create a Paystack customer." }, { status: 400 });
    }
    const r = await paystackPost("/customer", {
      email: lab.email, first_name: firstName, last_name: lastName, phone,
      metadata: { lab_id: lab.id },
    });
    if (!r.status) return NextResponse.json({ error: r.message ?? "Failed to create Paystack customer." }, { status: 502 });
    customerCode = r.data.customer_code as string;

    await prisma.labWallet.upsert({
      where:  { lab_id: lab.id },
      create: { lab_id: lab.id, paystack_customer_id: customerCode },
      update: { paystack_customer_id: customerCode },
    });
  } else if (phone) {
    // Update phone on existing customer before DVA creation
    await fetch(`${BASE}/customer/${customerCode}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, first_name: firstName, last_name: lastName }),
    });
  }

  // Create a new dedicated virtual account (forces new even if one already exists)
  const dva = await paystackPost("/dedicated_account", {
    customer: customerCode, preferred_bank: "titan-paystack",
  });
  if (!dva.status) {
    return NextResponse.json({ error: dva.message ?? "Failed to create virtual account." }, { status: 502 });
  }

  const bankName      = dva.data.bank?.name     ?? "Titan Trust Bank";
  const accountNumber = dva.data.account_number as string;
  const accountName   = dva.data.account_name   as string;

  await prisma.labWallet.update({
    where: { lab_id: lab.id },
    data:  { dva_bank_name: bankName, dva_account_number: accountNumber, dva_account_name: accountName },
  });

  return NextResponse.json({
    success: true,
    dva_bank_name:      bankName,
    dva_account_number: accountNumber,
    dva_account_name:   accountName,
    balance: wallet ? Number(wallet.balance) : 0,
  });
}
