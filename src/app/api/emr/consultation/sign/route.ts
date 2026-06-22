export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";
import type { ParsedRxItem } from "@/lib/emr/prescription";

interface Block {
  id: string;
  type: string;
  text?: string;
  data?: { parsed?: ParsedRxItem[]; tests?: string[] };
}

/**
 * POST /api/emr/consultation/sign
 * Finalises the note (read-only) and materialises any prescription / lab-order
 * blocks into the pharmacy and laboratory queues. Routes the encounter to the
 * next department.
 */
export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["doctor"])) {
      return NextResponse.json({ error: "You do not have consultation access." }, { status: 403 });
    }

    const { note_id, content } = await req.json();
    if (!note_id) return NextResponse.json({ error: "note_id is required." }, { status: 400 });

    const note = await prisma.consultationNote.findUnique({
      where: { id: note_id },
      include: { encounter: { select: { id: true, hospital_id: true, patient_id: true } } },
    });
    if (!note || note.encounter.hospital_id !== staff.hospital_id) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    // Persist the latest content alongside signing.
    const blocks: Block[] = Array.isArray(content)
      ? content
      : (note.content as unknown as Block[]) ?? [];

    const encounterId = note.encounter.id;
    const patientId = note.encounter.patient_id;

    let createdRx = 0;
    let createdLabs = 0;

    // Prescriptions
    for (const block of blocks) {
      if (block.type !== "prescription") continue;
      const parsed = block.data?.parsed ?? [];
      if (!parsed.length) continue;
      await prisma.prescription.create({
        data: {
          encounter_id: encounterId,
          patient_id: patientId,
          doctor_id: staff.id,
          raw_text: block.text ?? "",
          status: "pending",
          items: {
            create: parsed.map((p, idx) => ({
              drug_name: p.drug_name,
              strength: p.strength,
              form: p.form,
              dose: p.dose,
              route: p.route,
              frequency: p.frequency,
              frequency_per_day: p.frequency_per_day,
              duration_days: p.duration_days,
              quantity: p.quantity,
              instructions: p.instructions,
              raw_fragment: p.raw_fragment,
              confidence: p.confidence,
              sort_order: idx,
            })),
          },
        },
      });
      createdRx++;
    }

    // Lab orders
    for (const block of blocks) {
      if (block.type !== "lab_order") continue;
      const tests = (block.data?.tests ?? [])
        .map((t) => String(t).trim())
        .filter(Boolean);
      if (!tests.length) continue;
      await prisma.labOrder.create({
        data: {
          encounter_id: encounterId,
          patient_id: patientId,
          doctor_id: staff.id,
          clinical_note: block.text ?? null,
          status: "ordered",
          tests: {
            create: tests.map((name, idx) => ({ test_name: name, raw_fragment: name, sort_order: idx })),
          },
        },
      });
      createdLabs++;
    }

    await prisma.consultationNote.update({
      where: { id: note_id },
      data: { content: blocks as object[], status: "signed", signed_at: new Date(), doctor_id: staff.id },
    });

    // Route the encounter: pharmacy if there are scripts, else lab if labs, else closed.
    const nextStatus = createdRx > 0 ? "pharmacy" : createdLabs > 0 ? "lab" : "closed";
    await prisma.hospitalEncounter.update({
      where: { id: encounterId },
      data: { status: nextStatus, ...(nextStatus === "closed" ? { closed_at: new Date() } : {}) },
    });

    return NextResponse.json({ success: true, prescriptions: createdRx, lab_orders: createdLabs, next_status: nextStatus });
  } catch (err) {
    console.error("[emr/consultation/sign]", err);
    return NextResponse.json({ error: "Failed to sign consultation." }, { status: 500 });
  }
}
