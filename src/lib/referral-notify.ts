// =============================================================================
// POVEON HEALTH - REFERRAL NOTIFICATIONS
// Email + SMS fan-out for referral lifecycle events (fire-and-forget pattern)
// =============================================================================

import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import {
  hospitalNewReferral,
  referralDoctorConfirmation,
  referralPatientNotice,
  referralStatusUpdate,
} from "@/lib/email/templates";
import { notify } from "@/lib/notify";
import { waTemplates } from "@/lib/whatsapp";
import type { WhatsAppMessage } from "@/lib/whatsapp";

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
}

export function referralTrackUrl(code: string): string {
  return `${appUrl()}/refer/track/${code}`;
}

function sendEmail(to: string, subject: string, html: string, tag: string) {
  resend.emails
    .send({ from: FROM_ADDRESS, to, subject, html })
    .then(({ error }) => {
      if (error) console.error(`[referral-email] ${tag}:`, JSON.stringify(error));
    })
    .catch((e) => console.error(`[referral-email] ${tag} error:`, e));
}

/**
 * Reach the patient on WhatsApp, falling back to SMS.
 * Fire-and-forget, mirroring how the emails above are dispatched.
 */
function notifyPatient(
  phone: string | null | undefined,
  whatsapp: WhatsAppMessage,
  smsBody: string,
  tag: string
) {
  const phoneValue = phone?.trim();
  if (!phoneValue) {
    console.warn(`[referral-notify] ${tag} skipped — no phone number`);
    return;
  }
  notify({ phone: phoneValue, whatsapp, sms: smsBody, tag: `referral-${tag}` }).catch((e) =>
    console.error(`[referral-notify] ${tag} error:`, e instanceof Error ? e.message : String(e))
  );
}

type ReferralLike = {
  code: string;
  patient_name: string;
  patient_age: number | null;
  patient_sex: string | null;
  patient_phone: string;
  patient_email: string | null;
  doctor_email: string;
  doctor_name: string;
  from_hospital: string;
  specialty: string;
  urgency: string;
};

/** Notify hospital, doctor and patient when a referral is created (or redirected in). */
export function notifyReferralCreated(
  referral: ReferralLike,
  hospital: { name: string; email: string | null },
  opts?: { redirectedFrom?: string }
) {
  const trackUrl = referralTrackUrl(referral.code);
  const dashboardUrl = `${appUrl()}/hospital-dashboard`;

  if (hospital.email) {
    sendEmail(
      hospital.email,
      `${referral.urgency === "emergency" ? "🚨 EMERGENCY — " : referral.urgency === "urgent" ? "⚠️ Urgent — " : ""}New Patient Referral — ${referral.code}`,
      hospitalNewReferral({
        hospitalName: hospital.name,
        code: referral.code,
        patientName: referral.patient_name,
        patientAge: referral.patient_age,
        patientSex: referral.patient_sex,
        specialty: referral.specialty,
        urgency: referral.urgency,
        doctorName: referral.doctor_name,
        fromHospital: referral.from_hospital,
        dashboardUrl,
        redirectedFrom: opts?.redirectedFrom,
      }),
      "hospital-new"
    );
  }

  // On a redirect the doctor/patient get a status update instead of a fresh confirmation
  if (opts?.redirectedFrom) return;

  sendEmail(
    referral.doctor_email,
    `Referral Sent — ${referral.code}`,
    referralDoctorConfirmation({
      doctorName: referral.doctor_name,
      patientName: referral.patient_name,
      hospitalName: hospital.name,
      code: referral.code,
      specialty: referral.specialty,
      trackUrl,
    }),
    "doctor-confirm"
  );

  if (referral.patient_email) {
    sendEmail(
      referral.patient_email,
      `Your Referral Code — ${referral.code}`,
      referralPatientNotice({
        patientName: referral.patient_name,
        doctorName: referral.doctor_name,
        hospitalName: hospital.name,
        code: referral.code,
        specialty: referral.specialty,
        trackUrl,
      }),
      "patient-notice"
    );
  }

  notifyPatient(
    referral.patient_phone,
    waTemplates.referralCreatedPatient({
      patientName: referral.patient_name,
      doctorName: referral.doctor_name,
      hospitalName: hospital.name,
      specialty: referral.specialty,
      code: referral.code,
      trackUrl,
    }),
    `${referral.doctor_name} has referred you to ${hospital.name} (${referral.specialty}). Your referral code is ${referral.code}. Track: ${trackUrl}`,
    "patient-created"
  );
}

/** Notify doctor and patient when a hospital accepts / rejects / redirects a referral. */
export function notifyReferralStatus(
  referral: ReferralLike,
  status: "accepted" | "rejected" | "redirected",
  hospital: { name: string },
  opts?: { newHospitalName?: string; responseNote?: string | null }
) {
  const trackUrl = referralTrackUrl(referral.code);
  const subjectByStatus = {
    accepted: `Referral Accepted — ${referral.code}`,
    rejected: `Referral Update — ${referral.code}`,
    redirected: `Referral Redirected — ${referral.code}`,
  } as const;

  sendEmail(
    referral.doctor_email,
    subjectByStatus[status],
    referralStatusUpdate({
      recipientName: referral.doctor_name,
      status,
      code: referral.code,
      patientName: referral.patient_name,
      hospitalName: hospital.name,
      newHospitalName: opts?.newHospitalName,
      responseNote: opts?.responseNote,
      trackUrl,
      isPatient: false,
    }),
    `doctor-${status}`
  );

  if (referral.patient_email) {
    sendEmail(
      referral.patient_email,
      subjectByStatus[status],
      referralStatusUpdate({
        recipientName: referral.patient_name,
        status,
        code: referral.code,
        patientName: referral.patient_name,
        hospitalName: hospital.name,
        newHospitalName: opts?.newHospitalName,
        responseNote: opts?.responseNote,
        trackUrl,
        isPatient: true,
      }),
      `patient-${status}`
    );
  }

  const smsByStatus = {
    accepted: `Good news! ${hospital.name} has ACCEPTED your referral ${referral.code}. You may proceed to the hospital with your code.`,
    rejected: `Update: ${hospital.name} could not accept your referral ${referral.code}. Please contact your doctor for next steps.`,
    redirected: `Update: your referral ${referral.code} was redirected to ${opts?.newHospitalName ?? "another hospital"}. Track: ${trackUrl}`,
  } as const;

  notifyPatient(
    referral.patient_phone,
    waTemplates.referralStatusUpdate({
      recipientName: referral.patient_name,
      status,
      code: referral.code,
      hospitalName: hospital.name,
      newHospitalName: opts?.newHospitalName,
      trackUrl,
    }),
    smsByStatus[status],
    `patient-${status}`
  );
}
