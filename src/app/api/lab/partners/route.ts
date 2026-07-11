export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

const PartnerSchema = z.object({
  type: z.enum(["hmo", "hospital", "company"]),
  name: z.string().min(1).max(200),
  contact_name: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(100).optional().or(z.literal("")),
  email: z.string().email().max(200).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

/** GET /api/lab/partners — the lab's partnered HMOs / hospitals / companies. */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

  const partners = await prisma.labPartner.findMany({
    where: { lab_id: auth.lab_id },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ success: true, partners });
}

/** POST /api/lab/partners — add a partner (owner or can_manage_professionals). */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals && !auth.permissions.can_manage_team) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const parsed = PartnerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "A partner type and name are required" }, { status: 400 });
  const d = parsed.data;

  const partner = await prisma.labPartner.create({
    data: {
      lab_id: auth.lab_id,
      type: d.type,
      name: d.name.trim(),
      contact_name: d.contact_name?.trim() || null,
      phone: d.phone?.trim() || null,
      email: d.email?.trim() || null,
      address: d.address?.trim() || null,
      notes: d.notes?.trim() || null,
    },
  });

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "partner_added", detail: `${d.type}: ${d.name.trim()}` });
  }

  return NextResponse.json({ success: true, partner }, { status: 201 });
}
