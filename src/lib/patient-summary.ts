/**
 * The summary a doctor reads before they read anything else.
 *
 * What used to sit at the top of a care-plan patient was their baseline: five
 * numbers they gave at sign-up, frozen on the day they joined. Six months and
 * forty messages later it was the least current thing on the page, and a doctor
 * picking up a patient they had not seen in weeks still had to reconstruct the
 * story from four panels.
 *
 * So the top of the page is now a written account of this patient drawn from
 * everything on file — conditions, that same baseline, what they are on, what
 * has been ordered, how the check-ins have gone, and what they have actually
 * said — and it is rewritten whenever any of that changes.
 *
 * Three rules it is built around:
 *
 *  - **It is a summary, not a judgement.** It reports what is on file and
 *    flags what is missing or overdue. It does not diagnose, does not suggest
 *    treatment, and does not tell a doctor what to do — a doctor reading a
 *    machine's clinical opinion at the top of a patient page is a worse
 *    outcome than no summary at all.
 *  - **It is written once, then left alone for a fortnight.** A summary that
 *    rewrote itself every time the record moved meant a doctor opening the
 *    same patient twice in a morning paid for two of them and read two
 *    different accounts of the same person. So: written the first time a
 *    patient is opened, rewritten no sooner than two weeks later, and
 *    rewritten on demand when a doctor asks for it. The fingerprint still has
 *    a job — after a fortnight, a record that has not actually moved does not
 *    need new words written about it.
 *  - **It never blocks the page.** No key, no network, a refusal — the doctor
 *    gets the record as before and a line saying the summary is unavailable.
 */

import { createHash } from "crypto";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { MED_LIVE_STATUSES, MED_SUGGESTED_STATUS } from "@/lib/medication-status";
import { ADHERENCE_LABEL, durationLabel } from "@/components/consults/baseline";
import { SCREENING_QUESTIONS } from "@/lib/screening";
import { summaryIsStale } from "@/lib/summary-cadence";

export { SUMMARY_MAX_AGE_DAYS, summaryIsStale } from "@/lib/summary-cadence";

const MODEL = "gpt-4o-mini";

/** Everything the summary is written from, in the order a doctor would ask. */
export type SummaryInput = {
  name: string;
  age: number | null;
  sex: string | null;
  conditions: string[];
  joinedAt: Date | null;
  riskLevel: string;
  riskReason: string | null;
  baseline: {
    capturedAt: Date | null;
    bp: string | null;
    glucose: string | null;
    adherence: string | null;
    hypertensionFor: string | null;
    diabetesFor: string | null;
    saidTheyTake: string | null;
    lastSeen: string | null;
    selfCare: string | null;
    notes: string | null;
  };
  medications: { name: string; dose: string | null; status: string }[];
  suggestedMedications: string[];
  tests: { name: string; due: string | null; status: string }[];
  plan: {
    title: string;
    items: { label: string; cadence: string; timesLogged: number; lastLogged: string | null }[];
  } | null;
  readings: { when: string; what: string }[];
  screenings: { when: string; severity: string; flagged: string[]; seenByDoctor: boolean }[];
  messages: { who: string; when: string; text: string }[];
  messagesFromPatient: number;
};

const day = (d: Date | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : null;

function ageFrom(dob: Date | null): number | null {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  const years = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  return years > 0 && years < 130 ? years : null;
}

/**
 * Assemble the record.
 *
 * Deliberately bounded at every turn — the last 30 messages, 12 readings, 6
 * check-ins. A summary written from four hundred messages is not a better
 * summary, and the cost of one is not worth paying per patient page.
 */
export async function gatherSummaryInput(patientId: string): Promise<SummaryInput | null> {
  const patient = await prisma.consultPatient.findUnique({ where: { id: patientId } });
  if (!patient) return null;

  const [prescriptions, tests, plan, messages, screenings, logs, logCounts] = await Promise.all([
    prisma.consultPrescription.findMany({
      where: {
        patient_id: patientId,
        status: { in: [...MED_LIVE_STATUSES, MED_SUGGESTED_STATUS] },
      },
      orderBy: { created_at: "desc" },
      take: 30,
    }),
    prisma.consultTestOrder.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: "desc" },
      take: 20,
    }),
    prisma.consultTreatmentPlan.findFirst({
      where: { patient_id: patientId, status: "active" },
      orderBy: { created_at: "desc" },
      include: { items: { orderBy: { position: "asc" } } },
    }),
    prisma.consultMessage.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: "desc" },
      take: 30,
    }),
    prisma.consultScreening.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: "desc" },
      take: 6,
    }).catch(() => []),
    prisma.consultPlanLog.findMany({
      where: { patient_id: patientId },
      orderBy: { created_at: "desc" },
      take: 12,
    }).catch(() => []),
    // How often each plan item has actually been done, over the whole plan
    // rather than the twelve most recent readings — "never once" is one of the
    // most useful things the summary can say, and the recent window cannot see
    // it.
    prisma.consultPlanLog.groupBy({
      by: ["item_id"],
      where: { patient_id: patientId },
      _count: { _all: true },
      _max: { logged_for: true },
    }).catch(() => []),
  ]);

  const loggedBy = new Map<string, { count: number; last: Date | null }>(
    (logCounts as { item_id: string; _count: { _all: number }; _max: { logged_for: Date | null } }[]).map(
      (g) => [g.item_id, { count: g._count._all, last: g._max.logged_for }]
    )
  );

  const bp =
    patient.baseline_bp_systolic != null && patient.baseline_bp_diastolic != null
      ? `${patient.baseline_bp_systolic}/${patient.baseline_bp_diastolic} mmHg`
      : null;
  const glucose =
    patient.baseline_glucose_mg_dl != null
      ? `${Number(patient.baseline_glucose_mg_dl)} mg/dL${
          patient.baseline_glucose_context ? ` (${patient.baseline_glucose_context})` : ""
        }`
      : null;

  return {
    name: patient.full_name,
    age: ageFrom(patient.date_of_birth),
    sex: patient.sex,
    conditions: patient.conditions,
    joinedAt: patient.subscribed_at,
    riskLevel: patient.risk_manual ?? patient.risk_level,
    riskReason: patient.risk_note ?? patient.risk_reason,
    baseline: {
      capturedAt: patient.baseline_captured_at,
      bp,
      glucose,
      adherence: patient.medication_adherence
        ? ADHERENCE_LABEL[patient.medication_adherence] ?? patient.medication_adherence
        : null,
      hypertensionFor: durationLabel(patient.hypertension_years),
      diabetesFor: durationLabel(patient.diabetes_years),
      saidTheyTake: patient.baseline_medications,
      lastSeen: patient.baseline_last_visit,
      selfCare: patient.baseline_self_care,
      notes: patient.baseline_notes,
    },
    medications: prescriptions
      .filter((p: { status: string }) => p.status !== MED_SUGGESTED_STATUS)
      .map((p: { medication: string; dosage: string | null; frequency: string | null; status: string }) => ({
        name: p.medication,
        dose: [p.dosage, p.frequency].filter(Boolean).join(", ") || null,
        status: p.status,
      })),
    suggestedMedications: prescriptions
      .filter((p: { status: string }) => p.status === MED_SUGGESTED_STATUS)
      .map((p: { medication: string }) => p.medication),
    tests: tests.map((t: { tests: string; due_date: Date | null; status: string }) => ({
      name: t.tests,
      due: day(t.due_date),
      status: t.status,
    })),
    plan: plan
      ? {
          title: plan.title,
          items: plan.items.map((i: { id: string; label: string; cadence: string }) => {
            const done = loggedBy.get(i.id);
            return {
              label: i.label,
              cadence: i.cadence,
              timesLogged: done?.count ?? 0,
              lastLogged: day(done?.last ?? null),
            };
          }),
        }
      : null,
    readings: logs
      .map((l: Record<string, unknown>) => ({
        // The day the reading is *about*, which is not always the day it was
        // typed in.
        when: day((l.logged_for ?? l.created_at) as Date) ?? "",
        what: describeReading(l),
      }))
      .filter((r: { what: string }) => r.what),
    screenings: (screenings as Record<string, unknown>[]).map((s) => ({
      when: day(s.created_at as Date) ?? "",
      severity: String(s.severity ?? "none"),
      // Stored as question keys; the summary needs the question a doctor would
      // recognise, not "chest_tightness".
      flagged: (Array.isArray(s.flagged) ? (s.flagged as string[]) : []).map(
        (key) => SCREENING_QUESTIONS.find((q) => q.key === key)?.tracks ?? key
      ),
      // An urgent check-in nobody has opened is exactly what the third
      // paragraph exists to surface.
      seenByDoctor: !!s.seen_at,
    })),
    // Oldest first, so the conversation reads forwards.
    messages: messages
      .slice()
      .reverse()
      .map((m: { sender: string; created_at: Date; body: string }) => ({
        who: m.sender === "patient" ? "Patient" : "Doctor",
        when: day(m.created_at) ?? "",
        text: (m.body ?? "").slice(0, 400),
      }))
      .filter((m: { text: string }) => m.text),
    messagesFromPatient: messages.filter((m: { sender: string }) => m.sender === "patient").length,
  };
}

/** "BP 148/92", "Glucose 140 mg/dL", "Weight 78kg" — whichever the log holds. */
function describeReading(log: Record<string, unknown>): string {
  const parts: string[] = [];
  if (log.systolic != null && log.diastolic != null) parts.push(`BP ${log.systolic}/${log.diastolic}`);
  if (log.glucose_mg_dl != null) parts.push(`glucose ${Number(log.glucose_mg_dl)} mg/dL`);
  if (log.weight_kg != null) parts.push(`weight ${Number(log.weight_kg)} kg`);
  if (log.value_number != null) parts.push(String(log.value_number));
  if (log.value_text) parts.push(String(log.value_text).slice(0, 120));
  if (log.note) parts.push(`— ${String(log.note).slice(0, 120)}`);
  return parts.join(", ");
}

/**
 * A fingerprint of everything the summary depends on.
 *
 * This is what makes "updates properly" true rather than hopeful. Anything that
 * would change the summary has to change this string, or a doctor will keep
 * reading last month's account of a patient who has since been put on two new
 * drugs. The whole input is hashed rather than a chosen handful of fields,
 * precisely so a field added later cannot be forgotten here.
 */
export function fingerprintInput(input: SummaryInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

const SYSTEM_PROMPT = `You write the one-screen summary that appears at the top of a patient's record in a Nigerian chronic-care programme (hypertension and diabetes). Your reader is the doctor responsible for this patient.

Write 3 short paragraphs, no headings, no bullet points, no markdown, about 130-190 words in total:

1. Who this patient is and what is being managed — age, sex, conditions, how long they have had them, how long they have been on the programme.
2. Where their care stands — what they are currently prescribed, what tests are outstanding or overdue, what their readings and check-ins have shown, and how engaged they have been.
3. What is missing or needs the doctor's attention — unanswered questions in the thread, a check-in nobody has acted on, medication drafted at sign-up and never confirmed, readings never taken, a test long overdue.

Rules you must not break:
- Report only what is in the record given to you. Never invent a reading, a date, a drug or a symptom.
- Say plainly when something is absent: "no blood pressure has been recorded since sign-up" is useful; guessing is not.
- Do NOT diagnose, do NOT recommend or adjust treatment, and do NOT state clinical opinions. Describe the record; the doctor decides.
- Do not address the patient or the doctor directly. No greetings, no sign-off, no "here is a summary".
- Refer to the patient by first name.
- Plain British English, calm and factual. Naira as ₦.`;

/** Ask for the summary. Returns null rather than throwing — this never blocks a page. */
export async function writeSummary(input: SummaryInput): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input, null, 1).slice(0, 24_000) },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text && text.length > 40 ? text : null;
  } catch (err) {
    console.error("[patient-summary] write failed:", err);
    return null;
  }
}

export type PatientSummary = {
  text: string | null;
  at: Date | null;
  /** True when this call wrote a new one rather than reusing the stored one. */
  fresh: boolean;
  /** Why there is no summary, when there isn't one. */
  unavailable: string | null;
};

/**
 * The current summary for this patient.
 *
 * Written the first time anyone opens them, then left alone: a stored summary
 * less than a fortnight old is returned as it stands, without reading the
 * record at all. That early return is the point — gathering the input is seven
 * queries, and doing them on every patient page to conclude "nothing to do"
 * is the expensive half of a summary nobody asked to be rewritten.
 *
 * Past a fortnight the record is read once. If nothing material has changed,
 * the existing words are kept and only their date is refreshed, which buys
 * another fortnight of quiet; if something has, new words are written.
 *
 * `force` is a doctor pressing re-read, and skips all of it.
 */
export async function ensurePatientSummary(
  patientId: string,
  opts: { force?: boolean } = {}
): Promise<PatientSummary> {
  const patient = await prisma.consultPatient.findUnique({
    where: { id: patientId },
    select: {
      summary_text: true,
      summary_at: true,
      summary_checked_at: true,
      summary_fingerprint: true,
    },
  });
  if (!patient) return { text: null, at: null, fresh: false, unavailable: "No such member." };

  const current = patient.summary_text;

  // Checked recently enough to stand. Nothing is read, nothing is written,
  // nothing is spent — this is the path almost every patient page takes.
  const lastLooked = patient.summary_checked_at ?? patient.summary_at;
  if (!opts.force && current && !summaryIsStale(lastLooked)) {
    return { text: current, at: patient.summary_at, fresh: false, unavailable: null };
  }

  const input = await gatherSummaryInput(patientId);
  if (!input) return { text: null, at: null, fresh: false, unavailable: "No such member." };

  const print = fingerprintInput(input);

  // A fortnight has passed but the record has not moved. Keep the words, and
  // reset only the clock — `summary_at` still says when they were written,
  // because that is what the doctor is told and it has to stay true.
  if (!opts.force && current && patient.summary_fingerprint === print) {
    await prisma.consultPatient.update({
      where: { id: patientId },
      data: { summary_checked_at: new Date() },
    });
    return { text: current, at: patient.summary_at, fresh: false, unavailable: null };
  }

  const text = await writeSummary(input);
  if (!text) {
    // Keep whatever we had. A stale summary clearly labelled with its date
    // beats an empty panel where a summary used to be.
    return {
      text: current,
      at: patient.summary_at,
      fresh: false,
      unavailable: current
        ? "This is the last summary we could write; the record has changed since."
        : "The summary could not be written just now.",
    };
  }

  const at = new Date();
  await prisma.consultPatient.update({
    where: { id: patientId },
    data: { summary_text: text, summary_at: at, summary_checked_at: at, summary_fingerprint: print },
  });

  return { text, at, fresh: true, unavailable: null };
}
