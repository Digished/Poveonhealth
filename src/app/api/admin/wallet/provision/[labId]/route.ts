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
 * POST /api/admin/wallet/provision/[labId]
 * Body: { phone: string }
 *
 * Creates a Paystack customer + dedicated virtual account for the lab.
 * Saves DVA details to lab_wallets.
 * Idempotent — returns existing DVA if already provisioned.
 */
export async function POST(req: NextRequest, { params }: { params: { labId: string } }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { phone: rawPhone } = await req.json().catch(() => ({}));
  const phone = String(rawPhone ?? "").replace(/\D/g, "").replace(/^234/, "0");
  if (!phone) return NextResponse.json({ error: "Phone number is required." }, { status: 400 });

  const lab = await prisma.lab.findUnique({
    where: { id: params.labId },
    select: { id: true, name: true, email: true },
  });
  if (!lab) return NextResponse.json({ error: "Lab not found." }, { status: 404 });
  if (!lab.email) return NextResponse.json({ error: "Lab has no email." }, { status: 422 });

  // Return existing DVA immediately
  const existing = await prisma.labWallet.findUnique({ where: { lab_id: lab.id } });
  if (existing?.dva_account_number) {
    return NextResponse.json({
      success: true, already_provisioned: true,
      dva_bank_name:      existing.dva_bank_name,
      dva_account_number: existing.dva_account_number,
      dva_account_name:   existing.dva_account_name,
      balance:            Number(existing.balance),
    });
  }

  const nameParts = lab.name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName  = nameParts.slice(1).join(" ") || "Lab";

  // Create or reuse Paystack customer
  let customerCode = existing?.paystack_customer_id ?? null;

  if (!customerCode) {
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
  } else {
    // Update phone on existing customer before DVA creation
    await fetch(`${BASE}/customer/${customerCode}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, first_name: firstName, last_name: lastName }),
    });
  }

  // Create dedicated virtual account
  const dva = await paystackPost("/dedicated_account", {
    customer: customerCode, preferred_bank: "titan-paystack",
  });
  if (!dva.status) return NextResponse.json({ error: dva.message ?? "Failed to create virtual account." }, { status: 502 });

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
    balance: 0,
  });
}
