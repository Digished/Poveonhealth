export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPharmacyFromRequest } from "@/lib/consult";

const PAGE_SIZE = 25;

/** GET /api/pharmacy/customers — the pharmacy's regulars, most recent first. */
export async function GET(req: NextRequest) {
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

    const [total, customers] = await Promise.all([
      prisma.pharmacyCustomer.count({ where }),
      prisma.pharmacyCustomer.findMany({
        where,
        orderBy: [{ last_visit_at: "desc" }, { created_at: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

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
