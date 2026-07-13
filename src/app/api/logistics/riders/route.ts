export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLogisticsAuth } from "@/lib/logistics-auth";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { riderInviteEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/rides";

/** GET /api/logistics/riders — this partner's dispatch riders. */
export async function GET(req: NextRequest) {
  const auth = await getLogisticsAuth(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const riders = await prisma.rider.findMany({
    where: { partner_id: auth.partner_id },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json({ success: true, riders });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().min(6).max(50),
});

/** POST /api/logistics/riders — add a dispatch rider by email. */
export async function POST(req: NextRequest) {
  const auth = await getLogisticsAuth(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A name, valid email and phone are required." }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await prisma.rider.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "A rider with this email already exists." }, { status: 409 });

  const rider = await prisma.rider.create({
    data: {
      partner_id: auth.partner_id,
      name: parsed.data.name.trim(),
      email,
      phone: parsed.data.phone.trim(),
    },
  });

  const partner = await prisma.logisticsPartner.findUnique({
    where: { id: auth.partner_id },
    select: { name: true },
  });
  resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: "You've been added as a Poveon rider",
    html: riderInviteEmail({
      riderName: rider.name,
      partnerName: partner?.name ?? "Your logistics company",
      loginUrl: `${appUrl()}/rider`,
    }),
  }).catch(() => {});

  return NextResponse.json({ success: true, rider });
}
