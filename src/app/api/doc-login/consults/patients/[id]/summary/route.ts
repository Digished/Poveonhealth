export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { ensurePatientSummary } from "@/lib/patient-summary";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/** The doctor's own member, or null. */
async function requireMember(req: NextRequest, id: string) {
  const email = await getDoctorEmailFromConsultRequest(req);
  if (!email) return null;
  const patient = await prisma.consultPatient.findUnique({
    where: { id },
    select: { id: true, doctor_email: true },
  });
  if (!patient || patient.doctor_email !== email) return null;
  return patient;
}

/**
 * GET  — the summary, written now if the record has changed since the last one.
 * POST — write a new one regardless, for a doctor who wants it re-read.
 *
 * Separate from the patient payload on purpose. The record must appear the
 * instant a doctor opens a patient; the summary can take a second longer and
 * arrive underneath, and if it never arrives the page is still a working page.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const patient = await requireMember(req, params.id);
    if (!patient) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    const summary = await ensurePatientSummary(patient.id);
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    console.error("[consults/summary GET]", err);
    return NextResponse.json({ error: "Could not load the summary." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const patient = await requireMember(req, params.id);
    if (!patient) return NextResponse.json({ error: "Member not found." }, { status: 404 });

    const summary = await ensurePatientSummary(patient.id, { force: true });
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    console.error("[consults/summary POST]", err);
    return NextResponse.json({ error: "Could not rewrite the summary." }, { status: 500 });
  }
}
