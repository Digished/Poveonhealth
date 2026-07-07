import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { hmoVitalsAlertEmail } from "@/lib/email/templates";
import type { HmoMember, HmoVitalsAlert, HmoVitalsReading, Hmo } from "@prisma/client";

// ── Clinical thresholds (centralised so they're easy to tune / make
//    per-patient later) ──
export const BP_WARNING = { systolic: 140, diastolic: 90 };
export const BP_CRITICAL = { systolic: 180, diastolic: 120 };
export const SUGAR_WARNING_MGDL = { fasting: 126, random: 200 };
export const SUGAR_CRITICAL_MGDL = 300;

// A rising trend = this many consecutive readings, each strictly higher
// than the one before (systolic for BP, glucose for sugar).
export const RISING_TREND_COUNT = 3;

// Don't email the same doctor about the same patient more than once
// within this window; the in-app feed still shows every alert.
export const ALERT_EMAIL_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

type NewAlert = Pick<HmoVitalsAlert, "type" | "severity" | "message">;

export function readingSummary(reading: HmoVitalsReading): string {
  if (reading.type === "bp") {
    const pulse = reading.pulse ? `, pulse ${reading.pulse} bpm` : "";
    return `Blood pressure ${reading.systolic}/${reading.diastolic} mmHg${pulse}`;
  }
  return `Blood sugar ${Number(reading.glucose_mg_dl)} mg/dL (${reading.glucose_context})`;
}

function thresholdAlerts(reading: HmoVitalsReading): NewAlert[] {
  const alerts: NewAlert[] = [];
  if (reading.type === "bp" && reading.systolic != null && reading.diastolic != null) {
    if (reading.systolic >= BP_CRITICAL.systolic || reading.diastolic >= BP_CRITICAL.diastolic) {
      alerts.push({
        type: "bp_threshold",
        severity: "critical",
        message: `BP ${reading.systolic}/${reading.diastolic} — at or above ${BP_CRITICAL.systolic}/${BP_CRITICAL.diastolic} (hypertensive crisis range)`,
      });
    } else if (reading.systolic >= BP_WARNING.systolic || reading.diastolic >= BP_WARNING.diastolic) {
      alerts.push({
        type: "bp_threshold",
        severity: "warning",
        message: `BP ${reading.systolic}/${reading.diastolic} — at or above ${BP_WARNING.systolic}/${BP_WARNING.diastolic}`,
      });
    }
  }
  if (reading.type === "sugar" && reading.glucose_mg_dl != null) {
    const value = Number(reading.glucose_mg_dl);
    const context = reading.glucose_context === "fasting" ? "fasting" : "random";
    const warnAt = SUGAR_WARNING_MGDL[context];
    if (value >= SUGAR_CRITICAL_MGDL) {
      alerts.push({
        type: "sugar_threshold",
        severity: "critical",
        message: `Blood sugar ${value} mg/dL (${context}) — at or above ${SUGAR_CRITICAL_MGDL}`,
      });
    } else if (value >= warnAt) {
      alerts.push({
        type: "sugar_threshold",
        severity: "warning",
        message: `Blood sugar ${value} mg/dL (${context}) — at or above ${warnAt} for a ${context} reading`,
      });
    }
  }
  return alerts;
}

async function risingTrendAlert(reading: HmoVitalsReading): Promise<NewAlert | null> {
  // Sugar readings are only comparable within the same context
  // (fasting vs random); BP trends compare systolic.
  const recent = await prisma.hmoVitalsReading.findMany({
    where: {
      member_id: reading.member_id,
      type: reading.type,
      ...(reading.type === "sugar" ? { glucose_context: reading.glucose_context } : {}),
    },
    orderBy: { recorded_at: "desc" },
    take: RISING_TREND_COUNT,
  });
  if (recent.length < RISING_TREND_COUNT) return null;

  const values = recent
    .map((r) => (r.type === "bp" ? r.systolic : Number(r.glucose_mg_dl)))
    .reverse(); // oldest → newest
  if (values.some((v) => v == null)) return null;

  const strictlyRising = values.every((v, i) => i === 0 || (v as number) > (values[i - 1] as number));
  if (!strictlyRising) return null;

  const alertType = reading.type === "bp" ? "bp_rising" : "sugar_rising";

  // One open rising alert per metric at a time — the doctor already knows.
  const existingOpen = await prisma.hmoVitalsAlert.findFirst({
    where: { member_id: reading.member_id, type: alertType, status: "open" },
    select: { id: true },
  });
  if (existingOpen) return null;

  const trail = values.map(String).join(" → ");
  return {
    type: alertType,
    severity: "warning",
    message:
      reading.type === "bp"
        ? `Rising blood pressure pattern: systolic ${trail} over the last ${RISING_TREND_COUNT} readings`
        : `Rising blood sugar pattern (${reading.glucose_context}): ${trail} mg/dL over the last ${RISING_TREND_COUNT} readings`,
  };
}

async function notifyDoctors(
  member: HmoMember & { hmo: Hmo },
  reading: HmoVitalsReading,
  alerts: HmoVitalsAlert[]
) {
  const [coverages, directs] = await Promise.all([
    prisma.hmoDoctorCoverage.findMany({
      where: { hmo_id: member.hmo_id },
      select: { doctor_email: true },
    }),
    prisma.hmoDoctorPatient.findMany({
      where: { member_id: member.id },
      select: { doctor_email: true },
    }),
  ]);
  const doctorEmails = Array.from(
    new Set([...coverages, ...directs].map((d) => d.doctor_email))
  );
  if (doctorEmails.length === 0) return;

  const cutoff = new Date(Date.now() - ALERT_EMAIL_COOLDOWN_MS);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://poveon.com";

  for (const doctorEmail of doctorEmails) {
    try {
      const recentEmail = await prisma.hmoAlertEmailLog.findFirst({
        where: {
          doctor_email: doctorEmail,
          member_id: member.id,
          created_at: { gt: cutoff },
        },
        select: { id: true },
      });
      if (recentEmail) continue;

      const profile = await prisma.doctorProfile.findUnique({
        where: { email: doctorEmail },
        select: { full_name: true, prefix: true },
      });
      const doctorName = profile?.full_name
        ? `${profile.prefix ? profile.prefix + " " : ""}${profile.full_name}`
        : "";

      const result = await resend.emails.send({
        from: FROM_ADDRESS,
        to: doctorEmail,
        subject: `${alerts.some((a) => a.severity === "critical") ? "CRITICAL vitals alert" : "Vitals alert"}: ${member.full_name} (${member.hmo.name})`,
        html: hmoVitalsAlertEmail({
          doctorName,
          patientName: member.full_name,
          hmoName: member.hmo.name,
          alerts: alerts.map((a) => ({ severity: a.severity, message: a.message })),
          readingSummary: readingSummary(reading),
          dashboardUrl: `${baseUrl}/doc-login/dashboard`,
        }),
      });
      if (result.error) {
        console.error("[hmo/alerts] alert email failed:", doctorEmail, result.error);
        continue;
      }

      await prisma.hmoAlertEmailLog.create({
        data: { doctor_email: doctorEmail, member_id: member.id, alert_id: alerts[0]?.id },
      });
    } catch (err) {
      console.error("[hmo/alerts] notify failed for", doctorEmail, err);
    }
  }
}

/**
 * Evaluates a freshly saved reading: creates threshold / rising-trend
 * alerts and emails the covering doctors (with a cooldown). Never throws —
 * a failure here must not fail the patient's vitals save.
 */
export async function evaluateReading(
  reading: HmoVitalsReading,
  member: HmoMember & { hmo: Hmo }
): Promise<HmoVitalsAlert[]> {
  try {
    const newAlerts: NewAlert[] = thresholdAlerts(reading);
    const rising = await risingTrendAlert(reading);
    if (rising) newAlerts.push(rising);
    if (newAlerts.length === 0) return [];

    const created: HmoVitalsAlert[] = [];
    for (const alert of newAlerts) {
      created.push(
        await prisma.hmoVitalsAlert.create({
          data: { ...alert, member_id: member.id, reading_id: reading.id },
        })
      );
    }

    await notifyDoctors(member, reading, created);
    return created;
  } catch (err) {
    console.error("[hmo/alerts] evaluateReading failed:", err);
    return [];
  }
}
