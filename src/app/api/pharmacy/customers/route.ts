export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPharmacyFromRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const PAGE_SIZE = 25;

/** GET /api/pharmacy/customers — the pharmacy's regulars, most recent first. */
export async function GET(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const params = req.nextUrl.searchParams;
    const q = (params.get("q") ?? "").trim();
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const carePlanOnly = params.get("care_plan") === "1";

    const where: Prisma.PharmacyCustomerWhereInput = { pharmacy_id: pharmacy.id };
    if (carePlanOnly) where.patient_id = { not: null };
    if (q) {
      where.OR = [
        { full_name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { code: { contains: q, mode: "insensitive" } },
      ];
    }

    // Members who chose this pharmacy but have not been in yet are customers
    // too — they are the whole point of being chosen. They are not written into
    // the book, so switching pharmacy removes them from this list at once.
    const chosen = await prisma.consultPatient.findMany({
      where: {
        preferred_pharmacy_id: pharmacy.id,
        status: "active",
        expires_at: { gt: new Date() },
        ...(q
          ? {
              OR: [
                { full_name: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q } },
                { code: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { full_name: "asc" },
      take: 200,
      select: { id: true, full_name: true, phone: true, code: true, subscribed_at: true },
    });

    const known = chosen.length
      ? await prisma.pharmacyCustomer.findMany({
          where: { pharmacy_id: pharmacy.id, patient_id: { in: chosen.map((c) => c.id) } },
          select: { patient_id: true },
        })
      : [];
    const knownIds = new Set(known.map((k) => k.patient_id).filter(Boolean) as string[]);
    const waiting = chosen.filter((c) => !knownIds.has(c.id));

    const [bookTotal, bookRows] = await Promise.all([
      prisma.pharmacyCustomer.count({ where }),
      // The two lists are paginated as one: everyone waiting comes first, since
      // by definition they have no last visit to sort by.
      (async () => {
        const offset = (page - 1) * PAGE_SIZE;
        const fromWaiting = Math.min(Math.max(0, waiting.length - offset), PAGE_SIZE);
        const remaining = PAGE_SIZE - fromWaiting;
        if (remaining <= 0) return [];
        return prisma.pharmacyCustomer.findMany({
          where,
          orderBy: [{ last_visit_at: "desc" }, { created_at: "desc" }],
          skip: Math.max(0, offset - waiting.length),
          take: remaining,
        });
      })(),
    ]);

    const offset = (page - 1) * PAGE_SIZE;
    const waitingPage = waiting.slice(offset, offset + PAGE_SIZE).map((c) => ({
      id: `pref-${c.id}`,
      pharmacy_id: pharmacy.id,
      patient_id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      code: c.code,
      visits: 0,
      total_spend: 0,
      last_visit_at: null,
      notes: null,
      created_at: c.subscribed_at,
      updated_at: c.subscribed_at,
      /** Chose this pharmacy on their care plan; not been in yet. */
      chose_you: true,
    }));

    const total = bookTotal + waiting.length;
    const customers = [...waitingPage, ...bookRows];

    return NextResponse.json({
      success: true,
      total,
      page,
      has_more: page * PAGE_SIZE < total,
      customers: customers.map((c) => ({
        id: c.id,
        full_name: c.full_name,
        phone: c.phone,
        code: c.code,
        on_care_plan: !!c.patient_id,
        chose_you: "chose_you" in c ? !!c.chose_you : false,
        visits: c.visits,
        total_spend: Number(c.total_spend),
        last_visit_at: c.last_visit_at,
        notes: c.notes,
      })),
    });
  } catch (err) {
    console.error("[pharmacy/customers GET]", err);
    return NextResponse.json({ error: "Could not load your customers." }, { status: 500 });
  }
}

const CreateSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  spend_naira: z.coerce.number().min(0).max(100_000_000).optional(),
});

/** POST /api/pharmacy/customers — log a walk-in who isn't on the care plan. */
export async function POST(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid customer." }, { status: 400 });
    }

    const customer = await prisma.pharmacyCustomer.create({
      data: {
        pharmacy_id: pharmacy.id,
        full_name: parsed.data.full_name,
        phone: parsed.data.phone || null,
        notes: parsed.data.notes || null,
        visits: 1,
        total_spend: parsed.data.spend_naira ?? 0,
        last_visit_at: new Date(),
      },
    });

    return NextResponse.json({ success: true, id: customer.id });
  } catch (err) {
    console.error("[pharmacy/customers POST]", err);
    return NextResponse.json({ error: "Could not add that customer." }, { status: 500 });
  }
}
