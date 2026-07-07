export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin(request: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const hmos = await prisma.hmo.findMany({
      orderBy: { created_at: "desc" },
      include: { _count: { select: { members: true } } },
    });

    const coverages = await prisma.hmoDoctorCoverage.groupBy({
      by: ["hmo_id"],
      _count: { doctor_email: true },
    });
    const coverageMap = new Map(coverages.map((c) => [c.hmo_id, c._count.doctor_email]));

    return NextResponse.json({
      success: true,
      hmos: hmos.map((h) => ({
        id: h.id,
        name: h.name,
        code: h.code,
        contact_email: h.contact_email,
        contact_phone: h.contact_phone,
        active: h.active,
        created_at: h.created_at,
        member_count: h._count.members,
        doctor_count: coverageMap.get(h.id) ?? 0,
      })),
    });
  } catch (err) {
    console.error("[admin/hmo GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only"),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().max(32).optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid HMO details" },
        { status: 400 }
      );
    }

    const code = parsed.data.code.trim().toUpperCase();
    const existing = await prisma.hmo.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: `An HMO with code ${code} already exists.` }, { status: 409 });
    }

    const hmo = await prisma.hmo.create({
      data: {
        name: parsed.data.name.trim(),
        code,
        contact_email: parsed.data.contact_email?.trim() || null,
        contact_phone: parsed.data.contact_phone?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, hmo });
  } catch (err) {
    console.error("[admin/hmo POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
