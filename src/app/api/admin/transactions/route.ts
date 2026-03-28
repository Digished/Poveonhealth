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
 * GET /api/admin/transactions
 * Query params:
 *   lab_id  — filter to one lab
 *   from    — ISO date string (inclusive)
 *   to      — ISO date string (inclusive, end of day)
 *   limit   — max rows returned (default 500)
 *
 * Returns a unified ledger of:
 *   - DVA / manual credits  (lab_wallet_credits, direction="credit")
 *   - Commission debits     (requests, direction="debit")
 * sorted newest-first.
 */
export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

  const { searchParams } = req.nextUrl;
  const labId   = searchParams.get("lab_id")  ?? null;
  const from    = searchParams.get("from")    ?? null;
  const to      = searchParams.get("to")      ?? null;
  const limit   = Math.min(Number(searchParams.get("limit") ?? 500), 1000);

  // Build date filter fragments
  const fromDate = from ? new Date(from) : null;
  const toDate   = to   ? new Date(`${to}T23:59:59.999Z`) : null;

  // ── 1. DVA / manual credits ────────────────────────────────────────────────
  type CreditRow = {
    id: string; lab_id: string; amount: string; balance_after: string;
    reference: string; channel: string;
    sender_name: string | null; sender_bank: string | null; created_at: Date;
  };

  let creditQuery = `
    SELECT lwc.id, lw.lab_id,
           lwc.amount::text,
           lwc.balance_after::text,
           lwc.reference,
           lwc.channel,
           lwc.sender_name,
           lwc.sender_bank,
           lwc.created_at
    FROM lab_wallet_credits lwc
    JOIN lab_wallets lw ON lw.id = lwc.wallet_id
    WHERE 1=1`;
  const creditParams: unknown[] = [];
  let pi = 1;

  if (labId)    { creditQuery += ` AND lw.lab_id = $${pi++}`;            creditParams.push(labId); }
  if (fromDate) { creditQuery += ` AND lwc.created_at >= $${pi++}`;      creditParams.push(fromDate); }
  if (toDate)   { creditQuery += ` AND lwc.created_at <= $${pi++}`;      creditParams.push(toDate); }
  creditQuery += ` ORDER BY lwc.created_at DESC LIMIT $${pi++}`;
  creditParams.push(limit);

  // ── 2. Commission debits ───────────────────────────────────────────────────
  type DebitRow = {
    id: string; lab_id: string; poveon_amount: string; lab_revenue_amount: string;
    code: string; tests: string; patient_name: string | null;
    test_breakdown: unknown; seen_at: Date | null;
  };

  let debitQuery = `
    SELECT r.id, r.lab_id,
           COALESCE(r.poveon_amount, 0)::text      AS poveon_amount,
           COALESCE(r.lab_revenue_amount, 0)::text AS lab_revenue_amount,
           r.code,
           r.tests,
           r.patient_name,
           r.test_breakdown,
           r.seen_at
    FROM requests r
    WHERE r.status IN ('seen','done')
      AND r.poveon_amount > 0`;
  const debitParams: unknown[] = [];
  let di = 1;

  if (labId)    { debitQuery += ` AND r.lab_id = $${di++}`;   debitParams.push(labId); }
  if (fromDate) { debitQuery += ` AND r.seen_at >= $${di++}`; debitParams.push(fromDate); }
  if (toDate)   { debitQuery += ` AND r.seen_at <= $${di++}`; debitParams.push(toDate); }
  debitQuery += ` ORDER BY r.seen_at DESC NULLS LAST LIMIT $${di++}`;
  debitParams.push(limit);

  const [credits, debits] = await Promise.all([
    prisma.$queryRawUnsafe<CreditRow[]>(creditQuery, ...creditParams),
    prisma.$queryRawUnsafe<DebitRow[]>(debitQuery,  ...debitParams),
  ]);

  // ── 3. Fetch lab names for all relevant lab IDs ────────────────────────────
  const allLabIds = Array.from(new Set([
    ...(credits as CreditRow[]).map((r: CreditRow) => r.lab_id),
    ...(debits  as DebitRow[]).map((r: DebitRow)   => r.lab_id),
  ]));
  const labs = await prisma.lab.findMany({
    where:  { id: { in: allLabIds } },
    select: { id: true, name: true },
  });
  const labNameMap: Record<string, string> = Object.fromEntries(
    labs.map((l: { id: string; name: string }) => [l.id, l.name])
  );

  // ── 4. Shape rows ──────────────────────────────────────────────────────────
  type TxOut = {
    id: string; lab_id: string; lab_name: string;
    type: string; direction: "credit" | "debit";
    amount: number; balance_after: number;
    description: string | null; actor_email: string | null;
    created_at: string;
    request_id: string | null; test_breakdown: unknown; tests_raw: unknown;
    quoted_price: number | null;
  };

  const creditRows: TxOut[] = (credits as CreditRow[]).map((c: CreditRow) => {
    const senderParts = [c.sender_name, c.sender_bank].filter(Boolean);
    return {
      id:             c.id,
      lab_id:         c.lab_id,
      lab_name:       labNameMap[c.lab_id] ?? c.lab_id,
      type:           c.channel === "manual" ? "manual" : "dva",
      direction:      "credit",
      amount:         Number(c.amount),
      balance_after:  Number(c.balance_after),
      description:    senderParts.length > 0
        ? `Transfer from ${senderParts.join(" · ")}`
        : c.channel === "manual" ? "Manual credit" : "DVA bank transfer",
      actor_email:    c.sender_name ?? null,
      created_at:     c.created_at.toISOString(),
      request_id:     null,
      test_breakdown: null,
      tests_raw:      null,
      quoted_price:   null,
    };
  });

  const debitRows: TxOut[] = (debits as DebitRow[]).map((d: DebitRow) => {
    const patient = d.patient_name ? ` · ${d.patient_name}` : "";
    return {
      id:             d.id,
      lab_id:         d.lab_id,
      lab_name:       labNameMap[d.lab_id] ?? d.lab_id,
      type:           "commission",
      direction:      "debit",
      amount:         Number(d.poveon_amount),
      balance_after:  0, // per-debit snapshots not stored; wallet.balance is source of truth
      description:    `Commission${patient} — ${d.code}`,
      actor_email:    null,
      created_at:     (d.seen_at ?? new Date()).toISOString(),
      request_id:     d.id,
      test_breakdown: d.test_breakdown,
      tests_raw:      d.tests,
      quoted_price:   Number(d.lab_revenue_amount) || null,
    };
  });

  // Merge and sort newest-first, then slice to limit
  const transactions = [...creditRows, ...debitRows]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);

  return NextResponse.json({ success: true, transactions });
}
