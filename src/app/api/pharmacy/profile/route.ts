export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPharmacyFromRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
});

/** PATCH /api/pharmacy/profile — the pharmacy completes its own details. */
export async function PATCH(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid details." }, { status: 400 });

    // The discount rate is a commercial term — only an admin may change it.
    const updated = await prisma.pharmacy.update({
      where: { id: pharmacy.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
        ...(parsed.data.address !== undefined ? { address: parsed.data.address || null } : {}),
        ...(parsed.data.city !== undefined ? { city: parsed.data.city || null } : {}),
        ...(parsed.data.state !== undefined ? { state: parsed.data.state || null } : {}),
      },
      select: { name: true, phone: true, address: true, city: true, state: true },
    });

    return NextResponse.json({ success: true, pharmacy: updated });
  } catch (err) {
    console.error("[pharmacy/profile]", err);
    return NextResponse.json({ error: "Could not save your details." }, { status: 500 });
  }
}
