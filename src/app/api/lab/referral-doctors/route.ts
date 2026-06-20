export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

const Schema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal("")),
  specialty: z.string().max(120).optional(),
  hospital: z.string().max(200).optional(),
  bank_name: z.string().max(120).optional(),
  account_number: z.string().max(40).optional(),
  account_name: z.string().max(200).optional(),
});

/**
 * POST /api/lab/referral-doctors
 * Lightweight "add a referring doctor to the pool" for front-desk onboarding —
 * gated on the registration permission (can_mark_seen) rather than the full
 * professional-management right. Commission defaults to 0; bank details are
 * optional (the picker flags when they're missing). Idempotent by name.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;
  const email = d.email?.trim() || null;

  const existing = await prisma.labProfessional.findFirst({
    where: { lab_id: auth.lab_id, name: { equals: d.name, mode: "insensitive" } },
    select: { id: true, name: true, account_number: true },
  });
  if (existing) {
    return NextResponse.json({ professional: { id: existing.id, name: existing.name, has_bank: !!existing.account_number } });
  }

  const created = await prisma.labProfessional.create({
    data: {
      lab_id: auth.lab_id,
      name: d.name,
      email,
      phone: d.phone || null,
      specialty: d.specialty || null,
      hospital: d.hospital || null,
      bank_name: d.bank_name || null,
      account_number: d.account_number || null,
      account_name: d.account_name || null,
    },
    select: { id: true, name: true, account_number: true },
  });
  return NextResponse.json({ professional: { id: created.id, name: created.name, has_bank: !!created.account_number } });
}
