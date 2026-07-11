export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const Schema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email().max(200),
  rating_overall: z.number().int().min(1).max(5),
  rating_accuracy: z.number().int().min(1).max(5).nullable().optional(),
  rating_speed: z.number().int().min(1).max(5).nullable().optional(),
  rating_staff: z.number().int().min(1).max(5).nullable().optional(),
  rating_environment: z.number().int().min(1).max(5).nullable().optional(),
  comment: z.string().max(1000).nullable().optional(),
});

/**
 * POST /api/feedback/[labId]/qr
 * Public feedback from the lab's shareable link / QR page (`/f/[labSlug]`) —
 * no login: the visitor identifies with their name + email, which also keys
 * the upsert (one review per email per lab via this channel; resubmitting
 * updates it). Stored with reviewer_type "qr" so labs can track QR feedback
 * separately from in-app patient/doctor reviews.
 */
export async function POST(req: NextRequest, { params }: { params: { labId: string } }) {
  try {
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ success: false, error: "Please fill your name, a valid email and an overall rating." }, { status: 400 });
    const d = parsed.data;

    const lab = await prisma.lab.findUnique({ where: { id: params.labId }, select: { id: true } });
    if (!lab) return NextResponse.json({ success: false, error: "Laboratory not found" }, { status: 404 });

    const email = d.email.trim().toLowerCase();
    const feedback = await prisma.labFeedback.upsert({
      where: { lab_id_reviewer_email_reviewer_type: { lab_id: lab.id, reviewer_email: email, reviewer_type: "qr" } },
      create: {
        lab_id: lab.id,
        reviewer_email: email,
        reviewer_type: "qr",
        is_anonymous: false,
        display_name: d.name.trim(),
        rating_overall: d.rating_overall,
        rating_accuracy: d.rating_accuracy ?? null,
        rating_speed: d.rating_speed ?? null,
        rating_staff: d.rating_staff ?? null,
        rating_environment: d.rating_environment ?? null,
        comment: d.comment?.trim() || null,
      },
      update: {
        display_name: d.name.trim(),
        rating_overall: d.rating_overall,
        rating_accuracy: d.rating_accuracy ?? null,
        rating_speed: d.rating_speed ?? null,
        rating_staff: d.rating_staff ?? null,
        rating_environment: d.rating_environment ?? null,
        comment: d.comment?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, id: feedback.id });
  } catch (err) {
    console.error("[feedback/qr]", err);
    return NextResponse.json({ success: false, error: "Could not submit your feedback — please try again." }, { status: 500 });
  }
}
