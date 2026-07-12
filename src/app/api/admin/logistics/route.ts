export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { logisticsInviteEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/rides";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/logistics — partners with their assigned labs and rider/ride counts. */
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [partners, links, riders] = await Promise.all([
    prisma.logisticsPartner.findMany({ orderBy: { created_at: "desc" } }),
    prisma.logisticsPartnerLab.findMany(),
    prisma.rider.findMany({ select: { id: true, partner_id: true } }),
  ]);

  const labIds = Array.from(new Set(links.map((l) => l.lab_id)));
  const labs = await prisma.lab.findMany({ where: { id: { in: labIds } }, select: { id: true, name: true } });
  const labName = new Map(labs.map((l) => [l.id, l.name]));

  const riderCount = new Map<string, number>();
  for (const r of riders) riderCount.set(r.partner_id, (riderCount.get(r.partner_id) ?? 0) + 1);

  return NextResponse.json({
    success: true,
    partners: partners.map((p) => ({
      ...p,
      labs: links
        .filter((l) => l.partner_id === p.id)
        .map((l) => ({ lab_id: l.lab_id, lab_name: labName.get(l.lab_id) ?? "—" })),
      rider_count: riderCount.get(p.id) ?? 0,
    })),
  });
}

const CreateSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  contact_name: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  lab_ids: z.array(z.string().uuid()).optional().default([]),
});

/** POST /api/admin/logistics — add a logistics partner and assign labs. */
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
  }
  const { name, email, contact_name, phone, address, lab_ids } = parsed.data;
  const normEmail = email.trim().toLowerCase();

  const existing = await prisma.logisticsPartner.findUnique({ where: { email: normEmail } });
  if (existing) return NextResponse.json({ error: "A partner with this email already exists." }, { status: 409 });

  const partner = await prisma.logisticsPartner.create({
    data: {
      name: name.trim(),
      email: normEmail,
      contact_name: contact_name || null,
      phone: phone || null,
      address: address || null,
    },
  });

  if (lab_ids.length) {
    await prisma.logisticsPartnerLab.createMany({
      data: lab_ids.map((lab_id) => ({ partner_id: partner.id, lab_id })),
      skipDuplicates: true,
    });
  }

  // Welcome email — best effort.
  resend.emails.send({
    from: FROM_ADDRESS,
    to: normEmail,
    subject: "Welcome to Poveon Logistics",
    html: logisticsInviteEmail({ partnerName: name.trim(), loginUrl: `${appUrl()}/logistics` }),
  }).catch(() => {});

  return NextResponse.json({ success: true, partner });
}
