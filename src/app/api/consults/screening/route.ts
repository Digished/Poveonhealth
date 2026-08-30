export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appUrl, getMemberFromRequest } from "@/lib/consult";
import { pushTo } from "@/lib/push";
import {
  nextDueOn,
  questionsFor,
  urgentAdvice,
  worstOf,
  type SymptomSeverity,
} from "@/lib/screening";
import { worse, type RiskLevel } from "@/lib/care-risk";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * How a reported symptom maps onto the triage level a doctor's list sorts on.
 *
 * A mild answer raises nothing: occasional tingling, morning headaches or an
 * up-and-down mood are worth recording and worth reading, but a flag that comes
 * up for all of them stops meaning anything. Only an answer the member was told
 * to seek care for reaches "critical".
 */
const SEVERITY_RISK: Record<SymptomSeverity, RiskLevel> = {
  urgent: "critical",
  concerning: "high",
  mild: "none",
  none: "none",
};

/** Midnight UTC of a day, which is how `due_on` is stored. */
function day(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * GET /api/consults/screening — the questions to ask, and whether they are due.
 *
 * The question set is filtered to the member's own conditions, so someone with
 * hypertension alone is never asked about foot ulcers or hypos.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const last = await prisma.consultScreening.findFirst({
      where: { patient_id: member.id },
      orderBy: { created_at: "desc" },
    });

    const today = day(new Date());
    const due = !last || day(new Date(last.due_on)) <= today;

    return NextResponse.json({
      success: true,
      due,
      questions: questionsFor(member.conditions),
      last: last
        ? {
            id: last.id,
            severity: last.severity,
            flagged: last.flagged,
            due_on: last.due_on,
            created_at: last.created_at,
          }
        : null,
    });
  } catch (err) {
    console.error("[consults/screening GET]", err);
    return NextResponse.json({ error: "Could not load your check-in." }, { status: 500 });
  }
}

const BodySchema = z.object({
  // question key -> chosen option value. Validated against the question set
  // rather than the schema, because the set grows and old clients must not be
  // rejected for sending a question we have since renamed.
  answers: z.record(z.string().max(64), z.string().max(64)),
  source: z.enum(["onboarding", "routine"]).default("routine"),
});

/**
 * POST /api/consults/screening — record a round.
 *
 * The severity and the flagged keys are derived here rather than trusted from
 * the client, because they are what a doctor's list sorts on. Anything urgent
 * comes back as advice the member is shown immediately — this is the one place
 * where waiting for the next review is the wrong answer.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "We could not read those answers." }, { status: 400 });
    }

    // Only questions this member was actually asked, so a stale page cannot
    // record an answer to something that no longer applies to them.
    const asked = new Set(questionsFor(member.conditions).map((q) => q.key));
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.data.answers)) {
      if (asked.has(key)) answers[key] = value;
    }
    if (Object.keys(answers).length === 0) {
      return NextResponse.json({ error: "No answers to record." }, { status: 400 });
    }

    const { severity, flagged } = worstOf(answers);
    const advice = urgentAdvice(answers);

    const round = await prisma.consultScreening.create({
      data: {
        patient_id: member.id,
        source: parsed.data.source,
        answers,
        severity,
        flagged: flagged.map((f) => f.key),
        due_on: nextDueOn(severity as SymptomSeverity),
      },
      select: { id: true, severity: true, due_on: true, created_at: true },
    });

    // A symptom is a reading of a different kind, and the doctor's list sorts on
    // one number. Raised the same way as a blood pressure: never quietly
    // downgraded, because one good month does not undo a run of bad ones.
    const raised = SEVERITY_RISK[severity as SymptomSeverity];
    if (raised !== "none") {
      const current = (member.risk_level ?? "none") as RiskLevel;
      const level = worse(current, raised);
      if (level !== current) {
        await prisma.consultPatient.update({
          where: { id: member.id },
          data: {
            risk_level: level,
            risk_reason: flagged[0] ? `Reported: ${flagged[0].label}` : "Symptoms reported",
            risk_rated_at: new Date(),
          },
        });
      }
    }

    // A flagged round is the only kind worth interrupting a doctor for. Fired
    // and forgotten: a push that fails must not cost the member their answers.
    if (member.doctor_email && (severity === "urgent" || severity === "concerning")) {
      void pushTo("doctor", member.doctor_email, {
        title:
          severity === "urgent"
            ? `${member.full_name} reported something urgent`
            : `${member.full_name} reported new symptoms`,
        body: flagged
          .slice(0, 2)
          .map((f) => f.label)
          .join(" · "),
        url: `${appUrl()}/doc-login/dashboard?tab=consults&member=${member.id}`,
        tag: `screening-${member.id}`,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      round: { ...round, flagged },
      advice,
    });
  } catch (err) {
    console.error("[consults/screening POST]", err);
    return NextResponse.json({ error: "Could not save your answers." }, { status: 500 });
  }
}
