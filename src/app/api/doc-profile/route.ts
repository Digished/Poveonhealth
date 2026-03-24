export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

async function getDoctorEmail(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("doc_token")?.value;
  if (!token) return null;
  const session = await prisma.doctorSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;
  return session.doctor_email;
}

/** GET /api/doc-profile — returns the authenticated doctor's full profile */
export async function GET(req: NextRequest) {
  const email = await getDoctorEmail(req);
  if (!email) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const profile = await prisma.doctorProfile.findUnique({ where: { email } });

  return NextResponse.json({
    success: true,
    profile: {
      email,
      prefix: profile?.prefix ?? null,
      full_name: profile?.full_name ?? null,
      phone: profile?.phone ?? null,
      hospital: profile?.hospital ?? null,
      bank_name: profile?.bank_name ?? null,
      account_number: profile?.account_number ?? null,
      account_name: profile?.account_name ?? null,
    },
  });
}

const UpdateSchema = z.object({
  prefix: z.string().max(30).optional().or(z.literal("")),
  full_name: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  hospital: z.string().max(200).optional().or(z.literal("")),
  bank_name: z.string().max(100).optional().or(z.literal("")),
  account_number: z.string().max(20).optional().or(z.literal("")),
  account_name: z.string().max(200).optional().or(z.literal("")),
});

/** PATCH /api/doc-profile — updates the authenticated doctor's profile */
export async function PATCH(req: NextRequest) {
  const email = await getDoctorEmail(req);
  if (!email) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid data.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Build only the fields that were provided
  const updateData: Record<string, string | null> = {};
  if (data.prefix !== undefined) updateData.prefix = data.prefix || null;
  if (data.full_name !== undefined) updateData.full_name = data.full_name || null;
  if (data.phone !== undefined) updateData.phone = data.phone || null;
  if (data.hospital !== undefined) updateData.hospital = data.hospital || null;
  if (data.bank_name !== undefined) updateData.bank_name = data.bank_name || null;
  if (data.account_number !== undefined) updateData.account_number = data.account_number || null;
  if (data.account_name !== undefined) updateData.account_name = data.account_name || null;

  const profile = await prisma.doctorProfile.upsert({
    where: { email },
    update: updateData,
    create: { email, ...updateData },
  });

  return NextResponse.json({
    success: true,
    profile: {
      email: profile.email,
      prefix: profile.prefix ?? null,
      full_name: profile.full_name ?? null,
      phone: profile.phone ?? null,
      hospital: profile.hospital ?? null,
      bank_name: profile.bank_name ?? null,
      account_number: profile.account_number ?? null,
      account_name: profile.account_name ?? null,
    },
  });
}
