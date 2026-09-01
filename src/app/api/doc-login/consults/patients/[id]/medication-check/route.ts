export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { parsePrescriptionBlock } from "@/lib/prescription-parse";
import { buildMedIndex, identify, matchMedication, suggestMedications } from "@/lib/med-match";
import { priceMedication } from "@/lib/med-pricing";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * POST /api/doc-login/consults/patients/[id]/medication-check
 *
 * Can this member actually get what is about to be written for them?
 *
 * A prescription is only as good as the shelf it is filled from. A doctor who
 * writes a drug their patient's pharmacy does not stock, or writes 10mg where
 * the shop only carries 5mg, finds out through the patient — a wasted journey
 * and a month of tablets missed. So the line is checked against that pharmacy's
 * price list as it is typed, and a name that is one slip from something real
 * comes back with what it was probably meant to be.
 *
 * Read-only and advisory. It never blocks a prescription: a doctor may have
 * good reason to write something the shop has not listed, and a stale price
 * list must not become a clinical veto.
 */
const BodySchema = z.object({ text: z.string().max(4000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsedBody = BodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Nothing to check." }, { status: 400 });
    }

    const patient = await prisma.consultPatient.findUnique({ where: { id: params.id } });
    if (!patient || patient.doctor_email !== email) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const lines = parsePrescriptionBlock(parsedBody.data.text);
    if (lines.length === 0) return NextResponse.json({ success: true, pharmacy: null, lines: [] });

    const pharmacy = patient.preferred_pharmacy_id
      ? await prisma.pharmacy.findUnique({ where: { id: patient.preferred_pharmacy_id } })
      : null;

    // No pharmacy chosen yet: say so once rather than marking every line a
    // problem, which would train a doctor to ignore the whole panel.
    if (!pharmacy) {
      return NextResponse.json({
        success: true,
        pharmacy: null,
        lines: lines.map((p) => ({
          medication: p.medication,
          strength: p.dosage,
          status: "no_pharmacy" as const,
        })),
      });
    }

    const catalogue = await prisma.pharmacyMedication.findMany({
      where: { pharmacy_id: pharmacy.id, active: true },
    });
    const index = buildMedIndex(catalogue);
    const defaultMargin = Number(pharmacy.margin_percent ?? 5);

    /** What this shop lists under one drug name, for "they have 5mg and 20mg". */
    const strengthsFor = (name: string) =>
      Array.from(
        new Set(
          index.all
            .filter((e) => e.id.name === name && e.id.strength)
            .map((e) => e.id.strength as string)
        )
      );

    const checked = lines.map((p) => {
      const want = identify({ name: p.medication, dosage: p.dosage, form: p.form });
      const base = {
        medication: p.medication,
        strength: want.strength,
        form: want.form,
        raw_text: p.raw_text,
      };

      const found = matchMedication(index, want);

      if (found.row) {
        const price = priceMedication({
          listNaira: Number(found.row.list_price),
          concessionNaira: Number(found.row.concession),
          marginPercent: Number(found.row.margin_percent ?? defaultMargin),
        });
        return {
          ...base,
          status: found.row.in_stock ? ("listed" as const) : ("out_of_stock" as const),
          listed_as: [found.row.name, found.row.strength].filter(Boolean).join(" "),
          member_naira: price.memberNaira,
          list_naira: Number(found.row.list_price),
          saving_naira: price.savingNaira,
        };
      }

      if (found.how === "strength_differs" || found.how === "ambiguous") {
        return {
          ...base,
          status: found.how,
          // The shop has the drug; what it does not have is this strength.
          available_strengths: strengthsFor(want.name),
        };
      }

      // Nothing by that name. If it is one slip from something real, say so —
      // this is where a typo gets caught.
      const near = suggestMedications(index, want, 3);
      return {
        ...base,
        status: "not_listed" as const,
        suggestions: near.map((s) => {
          const id = identify({ name: s.row.name, strength: s.row.strength, form: s.row.form });
          return {
            name: s.row.name.replace(/\s*\d.*$/, "").trim() || s.row.name,
            strengths: strengthsFor(id.name),
            score: Math.round(s.score * 100),
          };
        }),
      };
    });

    return NextResponse.json({
      success: true,
      pharmacy: { id: pharmacy.id, name: pharmacy.name, city: pharmacy.city },
      lines: checked,
    });
  } catch (err) {
    console.error("[consults/medication-check]", err);
    return NextResponse.json({ error: "Could not check that against the pharmacy." }, { status: 500 });
  }
}
