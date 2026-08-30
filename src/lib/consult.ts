// =============================================================================
// POVEON HEALTH — CARE PLAN (/consults)
//
// An annual subscription for people living with hypertension or diabetes.
// A member pays once a year and gets:
//   • a care code honoured by partner labs and pharmacies (issued on payment)
//   • an allowance of asynchronous messages to a doctor assigned to them
//
// Enrolment is keyed on the patient's email — the same identity the patient
// portal signs in with — so anyone we already hold an email for (a lab request,
// a referral) can enrol from their dashboard without a second account.
//
// The doctor's share of each subscription is held as a pending entitlement and
// released into their wallet in monthly instalments over the year. Prices, the
// doctor's share and the allowance are all set by an admin.
// =============================================================================

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { draftMedications, draftPlanItems, draftPlanNote } from "@/lib/care-draft";
import { MED_SUGGESTED_STATUS } from "@/lib/medication-status";

export const CONSULT_CONDITIONS = ["hypertension", "diabetes"] as const;
export type ConsultCondition = (typeof CONSULT_CONDITIONS)[number];

export const CONDITION_LABELS: Record<string, string> = {
  hypertension: "Hypertension (high blood pressure)",
  diabetes: "Diabetes",
};

/** Characters that can't be misread over the phone (no 0/O, 1/I/L). */
const CODE_CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
}

export const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

// ── Settings ─────────────────────────────────────────────────────────────────

export type ConsultSettingsPayload = {
  price_naira: number;
  doctor_share_naira: number;
  message_allowance: number;
  release_months: number;
  default_doctor_cap: number;
  lab_discount_percent: number;
  pharmacy_discount_percent: number;
  topup_price_naira: number;
  topup_messages: number;
};

export const CONSULT_DEFAULTS: ConsultSettingsPayload = {
  price_naira: 10_000,
  doctor_share_naira: 6_000,
  message_allowance: 40,
  release_months: 12,
  default_doctor_cap: 200,
  lab_discount_percent: 15,
  pharmacy_discount_percent: 10,
  topup_price_naira: 10_000,
  topup_messages: 40,
};

// Settings are read on nearly every care-plan request but change a few times a
// year, so a short per-process memo saves a query without going stale in any
// way an admin would notice.
let settingsCache: { at: number; value: ConsultSettingsPayload } | null = null;
const SETTINGS_TTL_MS = 60_000;

/** Drop the memo after an admin edits the terms. */
export function clearConsultSettingsCache() {
  settingsCache = null;
}

/**
 * Programme settings, falling back to the defaults above when the row has not
 * been created yet (fresh database, or the migration hasn't run).
 */
export async function getConsultSettings(): Promise<ConsultSettingsPayload> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.value;
  }
  try {
    const row = await prisma.consultSettings.findUnique({ where: { id: "default" } });
    if (!row) return { ...CONSULT_DEFAULTS };
    const value: ConsultSettingsPayload = {
      price_naira: Number(row.price_naira),
      doctor_share_naira: Number(row.doctor_share_naira),
      message_allowance: row.message_allowance,
      release_months: row.release_months,
      default_doctor_cap: row.default_doctor_cap,
      lab_discount_percent: row.lab_discount_percent,
      pharmacy_discount_percent: row.pharmacy_discount_percent,
      // Older rows predate the top-up columns; fall back rather than send NaN.
      topup_price_naira: Number(row.topup_price_naira ?? CONSULT_DEFAULTS.topup_price_naira),
      topup_messages: row.topup_messages ?? CONSULT_DEFAULTS.topup_messages,
    };
    settingsCache = { at: Date.now(), value };
    return value;
  } catch {
    return { ...CONSULT_DEFAULTS };
  }
}

// ── Codes ────────────────────────────────────────────────────────────────────

function randomSegment(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_CHARSET[Math.floor(Math.random() * CODE_CHARSET.length)];
  return out;
}

/** A member's discount code, e.g. "PVC-8X4K29Q". Retried until unique. */
export async function generateMemberCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = `PVC-${randomSegment(7)}`;
    const clash = await prisma.consultPatient.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  // Astronomically unlikely; fall back to something guaranteed unique.
  return `PVC-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * A reference for one scheduled test, e.g. "PVT-8H3K2".
 *
 * The member's care code says who they are; this says what was asked for. A
 * lab desk can take either — the code on the slip pulls up that one order, the
 * care code pulls up everything outstanding.
 */
export async function generateTestOrderCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = `PVT-${randomSegment(5)}`;
    const clash = await prisma.consultTestOrder.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  return `PVT-${Date.now().toString(36).toUpperCase()}`;
}

/** A pharmacy's code, e.g. "PH-4K29Q". */
export async function generatePharmacyCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = `PH-${randomSegment(5)}`;
    const clash = await prisma.pharmacy.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  return `PH-${Date.now().toString(36).toUpperCase()}`;
}

export function slugifyName(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "pharmacy";
}

export async function uniquePharmacySlug(name: string): Promise<string> {
  const base = slugifyName(name);
  for (let i = 0; i < 30; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const clash = await prisma.pharmacy.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ── Fair doctor assignment ───────────────────────────────────────────────────

export type AssignmentCandidate = {
  email: string;
  name: string;
  activeCount: number;
  cap: number;
};

/**
 * Pick the doctor a new member should be assigned to.
 *
 * "Fairly" means: among doctors an admin has approved for the care plan, who
 * are accepting members and are still below their own yearly cap, take the one
 * carrying the fewest active members. Ties break towards whoever was assigned
 * longest ago, so a burst of sign-ups spreads out instead of piling onto
 * whichever row the database returned first.
 *
 * Returns null when nobody is available — the member still subscribes, and an
 * admin can assign them by hand.
 */
export async function pickDoctorForMember(): Promise<string | null> {
  const settings = await getConsultSettings();

  // Only doctors an admin has cleared. Credentials are checked by hand — see
  // DoctorCredential — so an unapproved doctor never receives a member.
  const profiles = await prisma.doctorProfile.findMany({
    where: {
      claimed: true,
      consult_accepting: true,
      consult_approved: true,
      full_name: { not: null },
    },
    select: { email: true, consult_patient_cap: true },
  });
  if (profiles.length === 0) return null;

  const emails = profiles.map((p) => p.email);

  const [counts, lastAssigned] = await Promise.all([
    prisma.consultPatient.groupBy({
      by: ["doctor_email"],
      where: { doctor_email: { in: emails }, status: "active", expires_at: { gt: new Date() } },
      _count: { id: true },
    }),
    prisma.consultPatient.groupBy({
      by: ["doctor_email"],
      where: { doctor_email: { in: emails } },
      _max: { assigned_at: true },
    }),
  ]);

  const countBy = new Map(counts.map((c) => [c.doctor_email ?? "", c._count.id]));
  const lastBy = new Map(lastAssigned.map((c) => [c.doctor_email ?? "", c._max.assigned_at?.getTime() ?? 0]));

  const eligible = profiles
    .map((p) => ({
      email: p.email,
      count: countBy.get(p.email) ?? 0,
      cap: p.consult_patient_cap ?? settings.default_doctor_cap,
      last: lastBy.get(p.email) ?? 0,
    }))
    .filter((d) => d.cap > 0 && d.count < d.cap);

  if (eligible.length === 0) return null;

  eligible.sort((a, b) => a.count - b.count || a.last - b.last || a.email.localeCompare(b.email));
  return eligible[0].email;
}

// ── Earnings ─────────────────────────────────────────────────────────────────

/**
 * What a doctor's care-plan wallet looks like right now.
 *
 * `pending` is money already committed by members but not yet released;
 * `released` is what has landed in the wallet. The monthly instalment is the
 * doctor's live pool divided by the release window — so it moves up when a
 * member joins and down when one leaves, exactly as the pool does.
 */
export type ConsultWallet = {
  active_patients: number;
  pool_total: number;
  released: number;
  pending: number;
  monthly_estimate: number;
  release_months: number;
  per_patient: number;
};

export async function getDoctorConsultWallet(doctorEmail: string): Promise<ConsultWallet> {
  const settings = await getConsultSettings();

  const earnings = await prisma.consultEarning.findMany({
    where: { doctor_email: doctorEmail },
    select: { total_naira: true, released_naira: true, status: true },
  });

  let poolTotal = 0; // committed to this doctor across live entitlements
  let released = 0; // already in the wallet — cancelled entitlements included,
  //                   because money already released is not clawed back
  let pending = 0; // still to come, from entitlements that are still accruing
  let livePool = 0; // drives the monthly figure
  for (const e of earnings) {
    const total = Number(e.total_naira);
    const rel = Number(e.released_naira);
    released += rel;
    if (e.status === "cancelled") continue;
    poolTotal += total;
    if (e.status === "pending") {
      livePool += total;
      pending += Math.max(0, total - rel);
    }
  }

  const activePatients = await prisma.consultPatient.count({
    where: { doctor_email: doctorEmail, ...activeMemberWhere() },
  });

  const months = Math.max(1, settings.release_months);
  return {
    active_patients: activePatients,
    pool_total: Math.round(poolTotal),
    released: Math.round(released),
    pending: Math.round(pending),
    monthly_estimate: Math.round(livePool / months),
    release_months: months,
    per_patient: settings.doctor_share_naira,
  };
}

/** The period key a release run is stamped with, e.g. "2026-08". */
export function periodKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Release one month's instalment for every still-accruing entitlement.
 *
 * Idempotent: the (earning_id, period) unique key means running it twice in the
 * same month is a no-op. An entitlement whose member has left is closed instead
 * of paid, which is what makes the doctor's monthly figure fall when a member
 * leaves partway through the year.
 */
/** How many entitlements one release run will process. Keeps a run inside a
 *  serverless request; the caller repeats while `remaining` is non-zero. */
const RELEASE_BATCH = 400;

export async function runMonthlyRelease(period = periodKey()): Promise<{
  released_count: number;
  released_amount: number;
  closed_count: number;
  remaining: number;
}> {
  const settings = await getConsultSettings();
  const months = Math.max(1, settings.release_months);
  const now = new Date();

  const earnings = await prisma.consultEarning.findMany({
    where: { status: "pending", releases: { none: { period } } },
    include: { patient: { select: { status: true, expires_at: true } } },
    take: RELEASE_BATCH,
  });

  let releasedCount = 0;
  let releasedAmount = 0;
  let closedCount = 0;

  for (const earning of earnings) {
    const total = Number(earning.total_naira);
    const already = Number(earning.released_naira);
    const lapsed =
      earning.patient.status !== "active" ||
      (earning.patient.expires_at != null && earning.patient.expires_at < now);

    // Member gone — stop accruing, keep whatever was already released.
    if (lapsed) {
      await prisma.consultEarning.update({
        where: { id: earning.id },
        data: { status: "cancelled" },
      });
      closedCount++;
      continue;
    }

    const instalment = Math.min(Math.round(total / months), Math.round(total - already));
    if (instalment <= 0) {
      await prisma.consultEarning.update({ where: { id: earning.id }, data: { status: "complete" } });
      continue;
    }

    try {
      await prisma.$transaction([
        prisma.consultEarningRelease.create({
          data: {
            doctor_email: earning.doctor_email,
            earning_id: earning.id,
            amount_naira: instalment,
            period,
          },
        }),
        prisma.consultEarning.update({
          where: { id: earning.id },
          data: {
            released_naira: { increment: instalment },
            status: already + instalment >= total ? "complete" : "pending",
          },
        }),
      ]);
      releasedCount++;
      releasedAmount += instalment;
    } catch {
      // Unique violation — this earning was already released for this period.
    }
  }

  const remaining = await prisma.consultEarning.count({
    where: { status: "pending", releases: { none: { period } } },
  });

  return {
    released_count: releasedCount,
    released_amount: releasedAmount,
    closed_count: closedCount,
    remaining,
  };
}

// ── Paystack ─────────────────────────────────────────────────────────────────

/** Start a subscription payment; returns the hosted Paystack checkout URL. */
export async function initConsultPayment(params: {
  patientId: string;
  code: string;
  email: string;
  amountNaira: number;
  /**
   * What is being paid for. The return page reads this back off the reference
   * so a top-up and a subscription can share one callback URL.
   */
  purpose?: "care_plan" | "care_plan_topup";
  /** The ConsultTopup this reference belongs to, when it is a top-up. */
  topupId?: string;
}): Promise<{ authorizationUrl: string; reference: string } | null> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[consults] PAYSTACK_SECRET_KEY not set — cannot charge");
    return null;
  }
  try {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: params.email,
        amount: Math.round(params.amountNaira * 100), // kobo
        currency: "NGN",
        callback_url: `${appUrl()}/consults/paid`,
        metadata: {
          purpose: params.purpose ?? "care_plan",
          patient_id: params.patientId,
          code: params.code,
          ...(params.topupId ? { topup_id: params.topupId } : {}),
        },
      }),
    });
    const data = await res.json();
    if (!data.status || !data.data?.authorization_url) {
      console.error("[consults] paystack init failed:", JSON.stringify(data));
      return null;
    }
    return { authorizationUrl: data.data.authorization_url, reference: data.data.reference };
  } catch (e) {
    console.error("[consults] paystack init error:", e);
    return null;
  }
}

/** Confirm a Paystack reference actually succeeded. */
export async function verifyConsultPayment(reference: string): Promise<{
  success: boolean;
  amountNaira: number;
  patientId?: string;
  purpose?: string;
  topupId?: string;
}> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { success: false, amountNaira: 0 };
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json();
    if (!data.status || data.data?.status !== "success") return { success: false, amountNaira: 0 };
    return {
      success: true,
      amountNaira: Number(data.data.amount ?? 0) / 100,
      patientId: data.data.metadata?.patient_id,
      purpose: data.data.metadata?.purpose,
      topupId: data.data.metadata?.topup_id,
    };
  } catch (e) {
    console.error("[consults] paystack verify error:", e);
    return { success: false, amountNaira: 0 };
  }
}

// ── Activation ───────────────────────────────────────────────────────────────

/**
 * Turn a paid sign-up into a live membership: assign a doctor, open their
 * entitlement, and set the year running. Safe to call twice for the same
 * reference — a member who is already active is returned untouched.
 *
 * An admin can also call this by hand (`activatedBy`) for someone who paid
 * outside Paystack; everything downstream — doctor assignment, the doctor's
 * entitlement, the welcome email — behaves exactly as it does for a card
 * payment, which is the point.
 */
export async function activateMembership(params: {
  patientId: string;
  amountNaira: number;
  reference: string;
  /** Who activated it by hand, when it wasn't a Paystack payment. */
  activatedBy?: string;
}): Promise<{ ok: boolean; alreadyActive: boolean; doctorEmail: string | null }> {
  const patient = await prisma.consultPatient.findUnique({ where: { id: params.patientId } });
  if (!patient) return { ok: false, alreadyActive: false, doctorEmail: null };
  if (patient.status === "active") {
    return { ok: true, alreadyActive: true, doctorEmail: patient.doctor_email };
  }

  const settings = await getConsultSettings();
  const doctorEmail = patient.doctor_email ?? (await pickDoctorForMember());

  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(expires.getFullYear() + 1);

  // The care code exists only for a paid plan — an abandoned sign-up never
  // holds one. A renewing member keeps the code they already have.
  const code = patient.code ?? (await generateMemberCode());

  // Compare-and-set: Paystack can deliver the same callback twice, and the
  // member may refresh the return page. Only one caller flips the row.
  const claimed = await prisma.consultPatient.updateMany({
    where: { id: patient.id, status: { not: "active" } },
    data: {
      code,
      status: "active",
      subscribed_at: now,
      expires_at: expires,
      amount_paid: params.amountNaira,
      paystack_ref: params.reference,
      doctor_email: doctorEmail,
      assigned_at: doctorEmail ? now : null,
      message_allowance: settings.message_allowance,
    },
  });
  if (claimed.count === 0) {
    const current = await prisma.consultPatient.findUnique({
      where: { id: patient.id },
      select: { doctor_email: true },
    });
    return { ok: true, alreadyActive: true, doctorEmail: current?.doctor_email ?? null };
  }

  if (doctorEmail) {
    // One entitlement per subscription year. A member renewing gets a new one;
    // a retry of this activation finds the open row and only re-points it.
    const open = await prisma.consultEarning.findFirst({
      where: { patient_id: patient.id, status: "pending" },
      select: { id: true },
    });
    if (open) {
      await prisma.consultEarning.update({
        where: { id: open.id },
        data: { doctor_email: doctorEmail },
      });
    } else {
      await prisma.consultEarning.create({
        data: {
          doctor_email: doctorEmail,
          patient_id: patient.id,
          total_naira: settings.doctor_share_naira,
        },
      });
    }
  }

  if (doctorEmail) {
    // Give the doctor something to react to rather than a blank page. Awaited
    // rather than fired and forgotten — a serverless function can be frozen the
    // moment it responds — but never allowed to cost the member the activation
    // they have already paid for.
    await draftCarePlanFor(patient.id, doctorEmail).catch((e) =>
      console.error("[consults] draft care plan:", e)
    );
  }

  return { ok: true, alreadyActive: false, doctorEmail };
}

/**
 * Draft this member's opening plan and medication list, for the doctor to
 * review.
 *
 * Idempotent, and deliberately conservative: it does nothing at all if the
 * member already has a plan or any medication on file, so it can be called
 * again — at activation, when a doctor is assigned later, when a member is
 * moved — without ever overwriting real clinical work.
 *
 * Everything it writes is marked as a suggestion (see care-draft.ts): the plan
 * carries `source: "suggested"` and no `reviewed_at`, and the medications sit at
 * status "suggested", outside MED_LIVE_STATUSES, so the member never sees them
 * and no pharmacy can dispense against them until a doctor confirms.
 */
export async function draftCarePlanFor(
  patientId: string,
  doctorEmail: string
): Promise<{ plan: boolean; medications: number }> {
  const patient = await prisma.consultPatient.findUnique({
    where: { id: patientId },
    select: { id: true, conditions: true, baseline_medications: true },
  });
  if (!patient) return { plan: false, medications: 0 };

  const [existingPlan, existingMeds] = await Promise.all([
    prisma.consultTreatmentPlan.findFirst({
      where: { patient_id: patient.id, status: "active" },
      select: { id: true },
    }),
    prisma.consultPrescription.count({ where: { patient_id: patient.id } }),
  ]);

  let planWritten = false;
  if (!existingPlan) {
    const items = draftPlanItems(patient.conditions);
    await prisma.consultTreatmentPlan.create({
      data: {
        patient_id: patient.id,
        doctor_email: doctorEmail,
        title: "Starting plan",
        note: draftPlanNote(patient.conditions),
        source: "suggested",
        items: {
          create: items.map((item, i) => ({
            label: item.label,
            detail: item.detail,
            cadence: item.cadence,
            measure: item.measure,
            measure_label: item.measure_label,
            remind: item.remind,
            position: i,
          })),
        },
      },
    });
    planWritten = true;
  }

  let medsWritten = 0;
  if (existingMeds === 0) {
    const drafts = draftMedications(patient.baseline_medications);
    if (drafts.length) {
      await prisma.consultPrescription.createMany({
        data: drafts.map((d) => ({
          patient_id: patient.id,
          doctor_email: doctorEmail,
          medication: d.medication,
          form: d.form,
          dosage: d.dosage,
          frequency: d.frequency,
          duration_days: d.duration_days,
          instructions: d.instructions,
          raw_text: d.raw_text,
          status: MED_SUGGESTED_STATUS,
          source: "suggested",
        })),
      });
      medsWritten = drafts.length;
    }
  }

  return { plan: planWritten, medications: medsWritten };
}

// ── Message top-ups ──────────────────────────────────────────────────────────

/**
 * Credit a paid top-up onto the member's allowance.
 *
 * Idempotent by construction: the pending→paid flip is a compare-and-set on the
 * top-up row, and only the caller that wins it adds the messages. Paystack will
 * happily deliver the same callback twice and the member may refresh the return
 * page — neither can buy the same bundle twice.
 */
export async function creditTopup(params: {
  reference: string;
  topupId?: string;
  amountNaira: number;
}): Promise<{
  ok: boolean;
  alreadyCredited: boolean;
  messages: number;
  patientId: string | null;
}> {
  const topup = params.topupId
    ? await prisma.consultTopup.findUnique({ where: { id: params.topupId } })
    : await prisma.consultTopup.findUnique({ where: { paystack_ref: params.reference } });
  if (!topup) return { ok: false, alreadyCredited: false, messages: 0, patientId: null };

  const claimed = await prisma.consultTopup.updateMany({
    where: { id: topup.id, status: { not: "paid" } },
    data: {
      status: "paid",
      paid_at: new Date(),
      paystack_ref: params.reference,
      amount_naira: params.amountNaira || topup.amount_naira,
    },
  });
  if (claimed.count === 0) {
    return { ok: true, alreadyCredited: true, messages: topup.messages, patientId: topup.patient_id };
  }

  await prisma.consultPatient.update({
    where: { id: topup.patient_id },
    data: { message_allowance: { increment: topup.messages } },
  });

  return { ok: true, alreadyCredited: false, messages: topup.messages, patientId: topup.patient_id };
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

/** The signed-in patient's email, from the patient portal's own cookie. */
export async function getPatientEmailFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("patient_token")?.value;
  if (!token) return null;
  const session = await prisma.patientSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;
  return session.patient_email;
}

/**
 * This patient's care-plan enrolment, or null if they have never enrolled.
 *
 * Nothing runs nightly, so a lapsed year is settled here — the plan goes
 * inactive the moment it is read past its expiry, and everything downstream
 * can trust `status`.
 */
export async function getMemberByEmail(email: string) {
  const patient = await prisma.consultPatient.findUnique({ where: { email } });
  if (!patient) return null;
  if (patient.status === "active" && patient.expires_at && patient.expires_at < new Date()) {
    await prisma.consultPatient.update({ where: { id: patient.id }, data: { status: "expired" } });
    return { ...patient, status: "expired" };
  }
  return patient;
}

/**
 * What "active" means in a query.
 *
 * A plan goes inactive the moment its year runs out, and nothing runs nightly
 * to flip the flag — so every read filters on the expiry too, rather than
 * trusting `status` alone.
 */
export function activeMemberWhere() {
  return { status: "active", expires_at: { gt: new Date() } };
}

/** The signed-in patient's enrolment, or null. */
export async function getMemberFromRequest(req: NextRequest) {
  const email = await getPatientEmailFromRequest(req);
  if (!email) return null;
  return getMemberByEmail(email);
}

export const PHARMACY_COOKIE = "pharmacy_token";
export const PHARMACY_SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getPharmacyFromRequest(req: NextRequest) {
  const token = req.cookies.get(PHARMACY_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.pharmacySession.findUnique({
    where: { id: token },
    include: { pharmacy: true },
  });
  if (!session || session.expires_at < new Date()) return null;
  if (!session.pharmacy.active) return null;
  return session.pharmacy;
}

/** The doctor behind a doc_token cookie, or null. */
export async function getDoctorEmailFromConsultRequest(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("doc_token")?.value;
  if (!token) return null;
  const session = await prisma.doctorSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;
  return session.doctor_email;
}
