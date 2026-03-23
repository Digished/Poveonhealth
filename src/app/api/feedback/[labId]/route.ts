import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type FbRow = { rating_overall: number; rating_accuracy: number | null; rating_speed: number | null; rating_staff: number | null; rating_environment: number | null };
const avgField = (field: (f: FbRow) => number | null | undefined, rows: FbRow[]) => {
  const vals = rows.map(field).filter((v): v is number => v != null);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
};

const FeedbackSchema = z.object({
  is_anonymous:       z.boolean().default(false),
  display_name:       z.string().max(80).nullable().optional(),
  rating_overall:     z.number().int().min(1).max(5),
  rating_accuracy:    z.number().int().min(1).max(5).nullable().optional(),
  rating_speed:       z.number().int().min(1).max(5).nullable().optional(),
  rating_staff:       z.number().int().min(1).max(5).nullable().optional(),
  rating_environment: z.number().int().min(1).max(5).nullable().optional(),
  comment:            z.string().max(1000).nullable().optional(),
});

/** GET /api/feedback/[labId] — public aggregated + individual reviews */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ labId: string }> }
) {
  try {
    const { labId } = await params;
    const feedbacks = await prisma.labFeedback.findMany({
      where: { lab_id: labId },
      orderBy: { updated_at: "desc" },
    });

    const total = feedbacks.length;
    if (total === 0) {
      return NextResponse.json({ success: true, total: 0, averages: null, feedbacks: [] });
    }

    const averages = {
      overall:     avgField((f) => f.rating_overall, feedbacks),
      accuracy:    avgField((f) => f.rating_accuracy, feedbacks),
      speed:       avgField((f) => f.rating_speed, feedbacks),
      staff:       avgField((f) => f.rating_staff, feedbacks),
      environment: avgField((f) => f.rating_environment, feedbacks),
    };

    // Mask email for anonymous reviewers
    const public_feedbacks = feedbacks.map((f) => ({
      id: f.id,
      is_anonymous: f.is_anonymous,
      reviewer_label: f.is_anonymous
        ? (f.display_name ?? "Anonymous")
        : (f.display_name ?? f.reviewer_email.split("@")[0]),
      reviewer_type: f.reviewer_type,
      rating_overall: f.rating_overall,
      rating_accuracy: f.rating_accuracy,
      rating_speed: f.rating_speed,
      rating_staff: f.rating_staff,
      rating_environment: f.rating_environment,
      comment: f.comment,
      updated_at: f.updated_at,
    }));

    return NextResponse.json({ success: true, total, averages, feedbacks: public_feedbacks });
  } catch (err) {
    console.error("[feedback/GET]", err);
    return NextResponse.json({ error: "Failed to load feedback." }, { status: 500 });
  }
}

/** POST /api/feedback/[labId] — submit or update feedback (patient or doctor session) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ labId: string }> }
) {
  try {
    const { labId } = await params;

    // Determine reviewer from session cookie (patient_token or doc_token)
    let reviewerEmail: string | null = null;
    let reviewerType: "patient" | "doctor" | null = null;

    const patientToken = req.cookies.get("patient_token")?.value;
    const docToken = req.cookies.get("doc_token")?.value;

    if (patientToken) {
      const session = await prisma.patientSession.findUnique({ where: { id: patientToken } });
      if (session && session.expires_at > new Date()) {
        reviewerEmail = session.patient_email;
        reviewerType = "patient";
      }
    } else if (docToken) {
      const session = await prisma.doctorSession.findUnique({ where: { id: docToken } });
      if (session && session.expires_at > new Date()) {
        reviewerEmail = session.doctor_email;
        reviewerType = "doctor";
      }
    }

    if (!reviewerEmail || !reviewerType) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // Verify the lab exists
    const lab = await prisma.lab.findUnique({ where: { id: labId }, select: { id: true } });
    if (!lab) return NextResponse.json({ error: "Lab not found." }, { status: 404 });

    const body = await req.json();
    const parsed = FeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid feedback data.", details: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    const feedback = await prisma.labFeedback.upsert({
      where: { lab_id_reviewer_email_reviewer_type: { lab_id: labId, reviewer_email: reviewerEmail, reviewer_type: reviewerType } },
      create: {
        lab_id: labId,
        reviewer_email: reviewerEmail,
        reviewer_type: reviewerType,
        is_anonymous: data.is_anonymous,
        display_name: data.display_name ?? null,
        rating_overall: data.rating_overall,
        rating_accuracy: data.rating_accuracy ?? null,
        rating_speed: data.rating_speed ?? null,
        rating_staff: data.rating_staff ?? null,
        rating_environment: data.rating_environment ?? null,
        comment: data.comment ?? null,
      },
      update: {
        is_anonymous: data.is_anonymous,
        display_name: data.display_name ?? null,
        rating_overall: data.rating_overall,
        rating_accuracy: data.rating_accuracy ?? null,
        rating_speed: data.rating_speed ?? null,
        rating_staff: data.rating_staff ?? null,
        rating_environment: data.rating_environment ?? null,
        comment: data.comment ?? null,
      },
    });

    return NextResponse.json({ success: true, feedback });
  } catch (err) {
    console.error("[feedback/POST]", err);
    return NextResponse.json({ error: "Failed to save feedback." }, { status: 500 });
  }
}

/** GET own feedback for this lab — appended ?mine=1 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ labId: string }> }
) {
  try {
    const { labId } = await params;

    let reviewerEmail: string | null = null;
    const patientToken = req.cookies.get("patient_token")?.value;
    const docToken = req.cookies.get("doc_token")?.value;
    if (patientToken) {
      const s = await prisma.patientSession.findUnique({ where: { id: patientToken } });
      if (s && s.expires_at > new Date()) reviewerEmail = s.patient_email;
    } else if (docToken) {
      const s = await prisma.doctorSession.findUnique({ where: { id: docToken } });
      if (s && s.expires_at > new Date()) reviewerEmail = s.doctor_email;
    }
    if (!reviewerEmail) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    // Determine reviewer type for lookup
    const patType = req.cookies.get("patient_token")?.value ? "patient" : "doctor";
    const feedback = await prisma.labFeedback.findUnique({
      where: { lab_id_reviewer_email_reviewer_type: { lab_id: labId, reviewer_email: reviewerEmail, reviewer_type: patType } },
    });
    return NextResponse.json({ success: true, feedback: feedback ?? null });
  } catch (err) {
    console.error("[feedback/PATCH]", err);
    return NextResponse.json({ error: "Failed." }, { status: 500 });
  }
}
