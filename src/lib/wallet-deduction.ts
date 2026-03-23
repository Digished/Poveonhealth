/**
 * Shared wallet deduction utility.
 *
 * Called when a request transitions to "seen".
 * Uses quoted_price stored at creation time.
 * Falls back to SystemSetting["default_request_price"] for old/image requests.
 */

import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export async function deductWallet(req: {
  id: string;
  lab_id: string;
  code: string;
  patient_name: string | null;
  quoted_price: Decimal | null;
  tests: string;
}): Promise<number | null> {
  try {
    let charge: Decimal;

    if (req.quoted_price && new Decimal(req.quoted_price).greaterThan(0)) {
      // Use the price snapshotted at request creation time
      charge = new Decimal(req.quoted_price);
    } else {
      // Fallback for old requests or image-only requests
      const setting = await prisma.systemSetting.findUnique({ where: { key: "default_request_price" } });
      charge = new Decimal(setting?.value ?? "500");
    }

    const newBalance = await prisma.$transaction(async (tx) => {
      const current = await tx.labWallet.upsert({
        where: { lab_id: req.lab_id },
        create: { lab_id: req.lab_id, balance: new Decimal(0) },
        update: {},
      });

      const balance = new Decimal(current.balance).minus(charge);

      await tx.labWallet.update({
        where: { lab_id: req.lab_id },
        data: { balance },
      });

      await tx.walletTransaction.create({
        data: {
          lab_id: req.lab_id,
          type: "deduction",
          direction: "debit",
          amount: charge,
          balance_after: balance,
          description: `Request ${req.code} — ${req.patient_name ?? "patient"} · ₦${charge.toFixed(2)}`,
          request_id: req.id,
        },
      });

      return Number(balance);
    });

    return newBalance;
  } catch (e) {
    console.error("[wallet] deduction failed:", e);
    return null;
  }
}
