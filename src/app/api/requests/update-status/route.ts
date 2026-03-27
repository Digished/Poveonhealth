export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { resend, labSender } from "@/lib/email/resend";
import { doctorTestsCompleted } from "@/lib/email/templates";
import { logApiCall } from "@/lib/api-logger";
import { logLabActivity } from "@/lib/lab-activity";
import { createServerClient } from "@/lib/supabase/server";
import { resolveTests } from "@/lib/resolve-tests";

const UpdateStatusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["seen", "done"]),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const parsed = UpdateStatusSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });

    const { requestId, status } = parsed.data;

    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

    const requiredPerm = status === "seen" ? "can_mark_seen" : "can_mark_done";
    if (!auth.permissions[requiredPerm]) {
      return NextResponse.json({ success: false, error: "You do not have permission to perform this action" }, { status: 403 });
    }

    const req = await prisma.request.findUnique({
      where: { id: requestId },
      include: { lab: { select: { name: true, notification_email: true } } },
    });
    if (!req) return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    if (req.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const validTransitions: Record<string, string[]> = { incoming: ["seen"], seen: ["done"], done: [] };
    if (!validTransitions[req.status]?.includes(status)) {
      return NextResponse.json({ success: false, error: `Cannot transition from "${req.status}" to "${status}"` }, { status: 400 });
    }

    if (status === "seen") {
      await handleSeen(req, requestId);
    } else {
      await prisma.request.update({ where: { id: requestId }, data: { status: "done", completed_at: new Date() } });
    }

    // Activity log (non-critical)
    try {
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && auth.auth_method !== "api_key") {
        logLabActivity({
          lab_id: req.lab_id,
          actor_email: user.email ?? "unknown",
          actor_role: user.user_metadata?.role === "lab" ? "owner" : "member",
          action: status === "seen" ? "request_seen" : "request_done",
          detail: `Request ${req.code} for ${req.patient_name ?? "patient"} marked as ${status === "seen" ? "Patient Seen" : "Done"}`,
        });
      }
    } catch { /* non-critical */ }

    // Notify doctor when done
    if (status === "done") {
      const brand = req.lab.notification_email ? { name: req.lab.name } : undefined;
      resend.emails.send({
        from: labSender(req.lab),
        to: req.doctor_email,
        subject: `Tests Completed — ${req.patient_name ?? "Patient"}`,
        html: doctorTestsCompleted({ doctorName: req.doctor_name, patientName: req.patient_name ?? "Patient", labName: req.lab.name, code: req.code, brand }),
      }).catch(() => {});
    }

    logApiCall({ method: "POST", path: "/api/requests/update-status", status: 200, lab_id: req.lab_id, duration_ms: Date.now() - start });
    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[update-status] error:", error);
    logApiCall({ method: "POST", path: "/api/requests/update-status", status: 500, duration_ms: Date.now() - start });
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}

type BreakdownItem = { source?: string; poveon_fee?: number | null; unit_price?: number };

async function handleSeen(
  req: { id: string; code: string; lab_id: string; tests: string; test_breakdown: unknown },
  requestId: string,
) {
  const testsString = req.tests && req.tests !== "See attached image" ? req.tests : null;

  let breakdown: BreakdownItem[] = [];
  if (testsString) {
    try { breakdown = await resolveTests(testsString, req.lab_id) as BreakdownItem[]; } catch { /* non-fatal */ }
  } else if (Array.isArray(req.test_breakdown)) {
    breakdown = req.test_breakdown as BreakdownItem[];
  }

  let poveonFee = 0;
  let labRevenue = 0;
  for (const item of breakdown) {
    if (item.source === "lab_catalog") {
      poveonFee += Number(item.poveon_fee ?? 0);
      labRevenue += Number(item.unit_price ?? 0);
    }
  }

  console.log(`[seen] ${req.code}: poveon=₦${poveonFee} revenue=₦${labRevenue}`);

  // Step 1: Update request — use raw SQL to handle JSON field correctly.
  // This is a plain statement (no interactive transaction) — safe with PgBouncer.
  const breakdownJson = breakdown.length > 0 ? JSON.stringify(breakdown) : null;
  if (breakdownJson) {
    await prisma.$executeRawUnsafe(
      `UPDATE requests SET status='seen', seen_at=NOW(), test_breakdown=$1::jsonb, poveon_amount=$2, lab_revenue_amount=$3 WHERE id=$4`,
      breakdownJson, poveonFee, labRevenue, requestId,
    );
  } else {
    await prisma.$executeRawUnsafe(
      `UPDATE requests SET status='seen', seen_at=NOW(), poveon_amount=$1, lab_revenue_amount=$2 WHERE id=$3`,
      poveonFee, labRevenue, requestId,
    );
  }

  // Step 2: Deduct commission from wallet (separate operation — avoids PgBouncer interactive tx issues).
  if (poveonFee > 0) {
    await deductCommission(req.lab_id, requestId, req.code, poveonFee);
  }
}

/**
 * Deduct Poveon commission from the lab wallet.
 *
 * Design rules:
 * - Only runs if the lab has a provisioned DVA wallet (dva_account_number set).
 * - Idempotent: uses reference="commission:{requestId}" (unique constraint prevents double-charge).
 * - Uses a raw-SQL BEGIN/COMMIT-free atomic UPDATE for the balance, safe under PgBouncer.
 * - is_paid_to_poveon is set true only when balance was >= fee at deduction time.
 */
async function deductCommission(labId: string, requestId: string, code: string, fee: number) {
  // Only deduct if DVA is provisioned (lab has actively set up payments)
  const wallet = await prisma.labWallet.findUnique({ where: { lab_id: labId } });
  if (!wallet?.dva_account_number) {
    console.log(`[commission] ${code}: no DVA wallet — skipping deduction`);
    return;
  }

  // Idempotency: reference is unique in wallet_transactions
  const ref = `commission:${requestId}`;
  const alreadyRecorded = await prisma.walletTransaction.findUnique({ where: { reference: ref } });
  if (alreadyRecorded) {
    console.log(`[commission] ${code}: already deducted — skipping`);
    return;
  }

  const currentBalance = Number(wallet.balance);
  const newBalance = currentBalance - fee;
  const isPaid = currentBalance >= fee;

  // Atomic balance update (single UPDATE statement — no interactive tx needed)
  await prisma.$executeRawUnsafe(
    `UPDATE lab_wallets SET balance = balance - $1::numeric, updated_at = NOW() WHERE lab_id = $2`,
    fee, labId,
  );

  // Record the transaction
  await prisma.$executeRawUnsafe(
    `INSERT INTO wallet_transactions (id, lab_id, type, direction, amount, balance_after, description, reference, request_id, created_at)
     VALUES (gen_random_uuid(), $1, 'deduction', 'debit', $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (reference) DO NOTHING`,
    labId, fee, newBalance,
    isPaid ? `Commission for request ${code}` : `Commission for request ${code} — top up wallet to clear outstanding`,
    ref, requestId,
  );

  // Mark request as paid if balance was sufficient
  if (isPaid) {
    await prisma.$executeRawUnsafe(`UPDATE requests SET is_paid_to_poveon = true WHERE id = $1`, requestId);
  }

  console.log(`[commission] ${code}: ₦${fee} deducted. Balance: ₦${currentBalance} → ₦${newBalance}. Paid: ${isPaid}`);
}
