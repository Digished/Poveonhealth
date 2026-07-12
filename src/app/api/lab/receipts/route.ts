export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

type BreakdownItem = { raw?: string; canonical_name?: string; category?: string | null; unit_price?: number | null };

/** Build receipt line items + total from a request's stored test breakdown. */
function itemsFromBreakdown(testBreakdown: unknown): { items: { name: string; qty: number; unit_price: number | null; amount: number | null }[]; total: number } {
  const raw = Array.isArray(testBreakdown) ? (testBreakdown as BreakdownItem[]) : [];
  const items = raw.map((it) => {
    const name = (it.canonical_name || it.raw || "Test").trim();
    const price = typeof it.unit_price === "number" && it.unit_price > 0 ? it.unit_price : null;
    return { name, qty: 1, unit_price: price, amount: price };
  });
  const total = items.reduce((s, it) => s + (it.amount ?? 0), 0);
  return { items, total };
}

const Schema = z.object({
  request_id: z.string().min(1),
  kind: z.enum(["payment", "collection"]).optional(),
  amount: z.number().nonnegative().optional(), // override; defaults to breakdown/quoted total
  note: z.string().max(2000).optional(),
});

/**
 * GET /api/lab/receipts?request_id=<id>
 * List receipts issued for a request (most recent first). Requires can_view_requests.
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const requestId = request.nextUrl.searchParams.get("request_id");
  const where = requestId
    ? { lab_id: auth.lab_id, request_id: requestId }
    : { lab_id: auth.lab_id };
  const receipts = await prisma.requestReceipt.findMany({
    where,
    orderBy: { created_at: "desc" },
    take: requestId ? 50 : 100,
  });
  return NextResponse.json({ receipts });
}

/**
 * POST /api/lab/receipts
 * Issue a receipt against a request. Line items + total are derived from the
 * request's test breakdown (or `quoted_price` fallback) unless `amount` is
 * supplied. `receipt_no` is the next per-lab sequential number. Requires
 * can_mark_seen (front-desk).
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { request_id, kind = "payment", amount, note } = parsed.data;

  const req = await prisma.request.findUnique({
    where: { id: request_id },
    select: { id: true, lab_id: true, code: true, tests: true, test_breakdown: true, quoted_price: true, payment_mode: true },
  });
  if (!req || req.lab_id !== auth.lab_id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { items: breakdownItems, total: breakdownTotal } = itemsFromBreakdown(req.test_breakdown);
  // Prefer explicit amount, then breakdown total, then the quoted-price snapshot.
  const quoted = req.quoted_price != null ? Number(req.quoted_price) : 0;
  const finalAmount = amount != null ? amount : breakdownTotal > 0 ? breakdownTotal : quoted;
  // If we have no priced breakdown but do have a total, fall back to a single line.
  const items = breakdownItems.length > 0
    ? breakdownItems
    : [{ name: req.tests || "Laboratory tests", qty: 1, unit_price: finalAmount || null, amount: finalAmount || null }];

  // Assign the next per-lab receipt number, retrying on the unique constraint.
  let created = null as Awaited<ReturnType<typeof prisma.requestReceipt.create>> | null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const last = await prisma.requestReceipt.findFirst({
      where: { lab_id: auth.lab_id },
      orderBy: { receipt_no: "desc" },
      select: { receipt_no: true },
    });
    const nextNo = (last?.receipt_no ?? 0) + 1;
    try {
      created = await prisma.requestReceipt.create({
        data: {
          lab_id: auth.lab_id,
          request_id: req.id,
          receipt_no: nextNo,
          kind,
          currency: "NGN",
          amount: finalAmount,
          items,
          payment_mode: req.payment_mode ?? null,
          note: note ?? null,
          issued_by: auth.actor_email ?? null,
        },
      });
    } catch (e) {
      // Unique (lab_id, receipt_no) race — recompute and retry.
      if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") continue;
      throw e;
    }
  }
  if (!created) return NextResponse.json({ error: "Could not assign a receipt number, please retry" }, { status: 409 });

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "receipt_issued", detail: `#${created.receipt_no} (${kind}) for ${req.code}` });
  }

  return NextResponse.json({ receipt: created });
}
