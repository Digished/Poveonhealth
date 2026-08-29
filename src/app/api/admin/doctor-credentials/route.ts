export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { doctorCredentialsDecisionEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/doctor-credentials — the review queue, pending first. */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status") ?? "";
  const credentials = await prisma.doctorCredential.findMany({
    where: status ? { status } : {},
    orderBy: [{ status: "asc" }, { submitted_at: "desc" }],
    take: 200,
  });

  const emails = credentials.map((c) => c.email);

  type ProfileRow = {
    full_name: string | null; prefix: string | null; phone: string | null;
    hospitals: string[]; consult_approved: boolean;
  };
  const byEmail = new Map<string, ProfileRow>();
  const memberCount = new Map<string, number>();

  if (emails.length) {
    const [profiles, counts] = await Promise.all([
      prisma.doctorProfile.findMany({
        where: { email: { in: emails } },
        select: { email: true, full_name: true, prefix: true, phone: true, hospitals: true, consult_approved: true },
      }),
      // How many members each doctor already carries — context for the decision.
      prisma.consultPatient.groupBy({
        by: ["doctor_email"],
        where: { doctor_email: { in: emails }, status: "active" },
        _count: { id: true },
      }),
    ]);
    for (const p of profiles) {
      byEmail.set(p.email, {
        full_name: p.full_name,
        prefix: p.prefix,
        phone: p.phone,
        hospitals: p.hospitals,
        consult_approved: p.consult_approved,
      });
    }
    for (const c of counts) {
      if (c.doctor_email) memberCount.set(c.doctor_email, c._count.id);
    }
  }

  return NextResponse.json({
    success: true,
    pending: credentials.filter((c) => c.status === "pending").length,
    credentials: credentials.map((c) => {
      const p = byEmail.get(c.email);
      return {
        ...c,
        doctor_name: p?.full_name ? `${p.prefix ? `${p.prefix} ` : ""}${p.full_name}` : null,
        phone: p?.phone ?? null,
        hospitals: p?.hospitals ?? [],
        approved: !!p?.consult_approved,
        active_members: memberCount.get(c.email) ?? 0,
      };
    }),
  });
}

const DecisionSchema = z.object({
  email: z.string().email(),
  decision: z.enum(["approve", "reject", "revoke"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

/**
 * PATCH /api/admin/doctor-credentials — approve, reject, or revoke.
 *
 * Approval is the only thing that lets a doctor receive care-plan members;
 * revoking stops new assignments without disturbing the members they already
 * carry, so nobody is left without a doctor mid-year.
 */
export async function PATCH(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = DecisionSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  const { email, decision, note } = parsed.data;

  const profile = await prisma.doctorProfile.findUnique({ where: { email }, select: { full_name: true, prefix: true } });
  if (!profile) return NextResponse.json({ error: "That doctor has no Poveon profile." }, { status: 404 });

  const approved = decision === "approve";
  const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "unsubmitted";

  await prisma.$transaction([
    prisma.doctorCredential.upsert({
      where: { email },
      create: {
        email,
        status,
        reviewed_at: new Date(),
        reviewed_by: admin.email ?? null,
        review_note: note || null,
      },
      update: {
        status,
        reviewed_at: new Date(),
        reviewed_by: admin.email ?? null,
        review_note: note || null,
      },
    }),
    prisma.doctorProfile.update({ where: { email }, data: { consult_approved: approved } }),
  ]);

  // A revoke is an internal action; only tell the doctor about a decision on
  // something they actually filed.
  if (decision !== "revoke") {
    void resend.emails
      .send({
        from: FROM_ADDRESS,
        to: email,
        subject: approved ? "You're cleared for the Poveon Care Plan" : "About your care-plan application",
        html: doctorCredentialsDecisionEmail({
          doctorName: profile.full_name
            ? `${profile.prefix ? `${profile.prefix} ` : ""}${profile.full_name}`
            : "Doctor",
          approved,
          note: note || null,
          dashboardUrl: `${appUrl()}/doc-login/dashboard?tab=consults&sub=credentials`,
        }),
      })
      .catch((e) => console.error("[admin/doctor-credentials] email:", e));
  }

  return NextResponse.json({ success: true, approved });
}
