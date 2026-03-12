import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  account_number: z.string().regex(/^\d{10}$/, "Account number must be exactly 10 digits"),
  bank_code: z.string().min(1, "Bank code is required"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const { account_number, bank_code } = parsed.data;
    const paystackKey = process.env.PAYSTACK_SECRET_KEY;

    if (!paystackKey) {
      return NextResponse.json(
        { success: false, error: "Bank verification is not configured." },
        { status: 503 }
      );
    }

    const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${paystackKey}` },
      // 8-second timeout
      signal: AbortSignal.timeout(8000),
    });

    const data = await res.json();

    if (!res.ok || !data.status) {
      const message =
        data?.message === "Could not resolve account name. Check parameters or try again."
          ? "Account not found. Check the account number and bank, then try again."
          : "Could not verify account. Please try again.";
      return NextResponse.json({ success: false, error: message }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      account_name: data.data.account_name as string,
      account_number: data.data.account_number as string,
    });
  } catch (err) {
    console.error("[verify-account]", err);
    return NextResponse.json(
      { success: false, error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }
}
