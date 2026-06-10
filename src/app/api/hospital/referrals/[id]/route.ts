export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";
import { notifyReferralCreated, notifyReferralStatus } from "@/lib/referral-notify";

const ActionSchema = z.object({
  action: z.enum(["accept", "reject", "redirect"]),
  note: z.string().trim().max(2000).optional().nullable(),
  redirect_hospital_id: z.string().uuid().optional(),
});

/** PATCH /api/hospital/referrals/[id] — accept, reject or redirect a referral */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { id } = await params;
    const parsed = ActionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }
    const { action, note, redirect_hospital_id } = parsed.data;

    const referral = await prisma.referral.findUnique({ where: { id } });
    if (!referral || referral.to_hospital_id !== hospital.id) {
      return NextResponse.json({ error: "Referral not found." }, { status: 404 });
    }
    if (referral.status !== "pending") {
      return NextResponse.json({ error: "This referral has already been responded to." }, { status: 409 });
    }

    if (action === "accept" || action === "reject") {
      const status = action === "accept" ? "accepted" : "rejected";
      const updated = await prisma.referral.update({
        where: { id },
        data: {
          status,
          response_note: note || null,
          responded_at: new Date(),
          events: {
            create: {
              type: status,
              actor_type: "hospital",
              actor_label: hospital.name,
              note: note || null,
            },
          },
        },
      });

      notifyReferralStatus(updated, status, { name: hospital.name }, { responseNote: note });
      return NextResponse.json({ success: true, referral: updated });
    }

    // Redirect — forward the referral to another hospital, keeping the same code
    if (!redirect_hospital_id) {
      return NextResponse.json({ error: "Select a hospital to redirect to." }, { status: 400 });
    }
    if (redirect_hospital_id === hospital.id) {
      return NextResponse.json({ error: "Cannot redirect a referral to your own hospital." }, { status: 400 });
    }
    const newHospital = await prisma.hospital.findUnique({ where: { id: redirect_hospital_id } });
    if (!newHospital || !newHospital.is_active) {
      return NextResponse.json({ error: "The selected hospital is not available." }, { status: 404 });
    }

    const updated = await prisma.referral.update({
      where: { id },
      data: {
        status: "pending", // pending again, now with the new hospital
        to_hospital_id: newHospital.id,
        response_note: null,
        responded_at: null,
        events: {
          create: {
            type: "redirected",
            actor_type: "hospital",
            actor_label: hospital.name,
            from_hospital_id: hospital.id,
            to_hospital_id: newHospital.id,
            note: note || null,
          },
        },
      },
    });

    // New hospital gets a fresh referral email; doctor & patient get a redirect update
    notifyReferralCreated(updated, { name: newHospital.name, email: newHospital.email }, { redirectedFrom: hospital.name });
    notifyReferralStatus(updated, "redirected", { name: hospital.name }, { newHospitalName: newHospital.name, responseNote: note });

    return NextResponse.json({ success: true, referral: updated });
  } catch (err) {
    console.error("[hospital/referrals PATCH]", err);
    return NextResponse.json({ error: "Failed to update referral." }, { status: 500 });
  }
}
