import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const PAYSTACK_BASE = "https://api.paystack.co";
const SECRET = process.env.PAYSTACK_SECRET_KEY!;

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

async function paystackPost(path: string, body: object) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * POST /api/admin/wallet/provision/[labId]
 * Creates a Paystack customer + dedicated virtual account for the lab.
 * Accepts { phone } in request body — required by Paystack for DVA eligibility.
 * Safe to call again — idempotent (skips if DVA already assigned).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { labId: string } },
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const phoneInput: string = (body.phone ?? "").toString().trim();

  if (!phoneInput) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }

  // Normalise: strip non-digits, convert international prefix to local
  const phone = phoneInput.replace(/\D/g, "").replace(/^234/, "0");

  const lab = await prisma.lab.findUnique({
    where: { id: params.labId },
    select: { id: true, name: true, email: true, request_email: true },
  });
  if (!lab) return NextResponse.json({ error: "Lab not found" }, { status: 404 });

  // Get or create wallet record
  let wallet = await prisma.labWallet.findUnique({ where: { lab_id: lab.id } });

  // If DVA already provisioned, return existing details
  if (wallet?.dva_account_number) {
    return NextResponse.json({
      success: true,
      already_provisioned: true,
      dva_bank_name: wallet.dva_bank_name,
      dva_account_number: wallet.dva_account_number,
      dva_account_name: wallet.dva_account_name,
    });
  }

  const labEmail = lab.email ?? lab.request_email;
  if (!labEmail) {
    return NextResponse.json({ error: "Lab has no email address for Paystack customer creation." }, { status: 422 });
  }

  // Step 1: Create (or reuse) Paystack customer
  let customerCode = wallet?.paystack_customer_id ?? null;

  const nameParts = lab.name.split(" ");

  if (!customerCode) {
    const custRes = await paystackPost("/customer", {
      email: labEmail,
      first_name: nameParts[0],
      last_name: nameParts.slice(1).join(" ") || "Lab",
      phone,
      metadata: { lab_id: lab.id },
    });

    if (!custRes.status) {
      console.error("[provision] create customer failed", custRes);
      return NextResponse.json({ error: custRes.message ?? "Failed to create Paystack customer." }, { status: 502 });
    }

    customerCode = custRes.data.customer_code as string;

    // Persist customer code immediately
    wallet = await prisma.labWallet.upsert({
      where: { lab_id: lab.id },
      create: { lab_id: lab.id, paystack_customer_id: customerCode },
      update: { paystack_customer_id: customerCode },
    });
  } else {
    // Customer already exists — update phone so DVA creation won't reject it
    await fetch(`https://api.paystack.co/customer/${customerCode}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phone, first_name: nameParts[0], last_name: nameParts.slice(1).join(" ") || "Lab" }),
    });
  }

  // Step 2: Assign dedicated virtual account
  const dvaRes = await paystackPost("/dedicated_account", {
    customer: customerCode,
    preferred_bank: "wema-bank",
  });

  if (!dvaRes.status) {
    console.error("[provision] create DVA failed", dvaRes);
    return NextResponse.json({ error: dvaRes.message ?? "Failed to create virtual account." }, { status: 502 });
  }

  const dva = dvaRes.data;
  const bankName: string = dva.bank?.name ?? "Virtual Bank";
  const accountNumber: string = dva.account_number;
  const accountName: string = dva.account_name;

  // Save DVA details
  await prisma.labWallet.update({
    where: { lab_id: lab.id },
    data: {
      dva_bank_name: bankName,
      dva_account_number: accountNumber,
      dva_account_name: accountName,
    },
  });

  return NextResponse.json({
    success: true,
    dva_bank_name: bankName,
    dva_account_number: accountNumber,
    dva_account_name: accountName,
  });
}
