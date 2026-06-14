export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromRequest, sendEncounterNote } from "@/lib/doctor-encounter";

const BodySchema = z.object({ note: z.string().trim().min(1).max(4000) });

/** POST /api/doc-login/encounters/[id]/note — send a note to the patient by email. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const email = await getDoctorEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "A note is required." }, { status: 400 });

    const encounter = await prisma.encounter.findUnique({ where: { id: params.id } });
    if (!encounter || encounter.doctor_email !== email) {
      return NextResponse.json({ error: "Encounter not found." }, { status: 404 });
    }

    const profile = await prisma.doctorProfile.findUnique({ where: { email } });
    const doctorName = [profile?.prefix, profile?.full_name].filter(Boolean).join(" ").trim();

    await sendEncounterNote(encounter, doctorName, parsed.data.note);

    await prisma.encounter.update({
      where: { id: encounter.id },
      data: { doctor_note: parsed.data.note, status: "responded", responded_at: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/encounters/note]", err);
    return NextResponse.json({ error: "Failed to send the note." }, { status: 500 });
  }
}
