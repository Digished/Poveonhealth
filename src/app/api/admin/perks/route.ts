export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/perks — all doctor perks, newest first, with lab names. */
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const perks = await prisma.doctorPerk.findMany({ orderBy: { created_at: "desc" } });
  const labIds = Array.from(new Set(perks.map((p) => p.lab_id)));
  const labs = await prisma.lab.findMany({ where: { id: { in: labIds } }, select: { id: true, name: true } });
  const labName = new Map(labs.map((l) => [l.id, l.name]));

  return NextResponse.json({
    success: true,
    perks: perks.map((p) => ({ ...p, lab_name: labName.get(p.lab_id) ?? "—" })),
  });
}

const CreateSchema = z.object({
  doctor_email: z.string().email(),
  lab_id: z.string().uuid(),
  type: z.string().default("free_ride"),
  uses: z.coerce.number().int().min(1).max(100).default(1),
  note: z.string().max(300).optional().or(z.literal("")),
});

/** POST /api/admin/perks — assign a perk to a doctor for a lab. */
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
  }
  const { doctor_email, lab_id, type, uses, note } = parsed.data;

  const lab = await prisma.lab.findUnique({ where: { id: lab_id }, select: { id: true } });
  if (!lab) return NextResponse.json({ error: "Lab not found" }, { status: 404 });

  const perk = await prisma.doctorPerk.create({
    data: {
      doctor_email: doctor_email.trim().toLowerCase(),
      lab_id,
      type: type || "free_ride",
      remaining_uses: uses,
      total_uses: uses,
      note: note || null,
    },
  });

  return NextResponse.json({ success: true, perk });
}
