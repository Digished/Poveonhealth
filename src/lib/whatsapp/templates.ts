/**
 * WhatsApp message builders.
 *
 * Every builder returns both:
 *   • `body`            — the human-readable text. Used verbatim inside an open
 *                         24-hour session, on the Twilio sandbox, and as the SMS
 *                         fallback body.
 *   • `contentSid` +
 *     `contentVariables`— the approved Content Template and its positional
 *                         variables, used for business-initiated sends.
 *
 * The variable numbering below is the contract with the templates registered in
 * the Twilio Content Template Builder — see docs/WHATSAPP_SETUP.md for the
 * exact template text each SID must be approved with. Changing the order here
 * without re-approving the template will send the right words to the wrong slots.
 */

import { contentSidFor } from "./config";
import type { WhatsAppMessage } from "./twilio";

export interface PhoneEntryLike {
  number: string;
  label?: string;
}

/** Template variables must be short, single-line and non-empty. */
function v(value: string | null | undefined, fallback = "—"): string {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

function greeting(fullName: string | null | undefined): string {
  const first = firstName(fullName);
  return first ? `Hi ${first}, ` : "";
}

/** "Front Desk: +234801…, +234802…" — one line, safe as a template variable. */
export function formatLabPhones(phones: PhoneEntryLike[] | null | undefined): string {
  if (!phones?.length) return "";
  return phones
    .map((p) => (p.label ? `${p.label}: ${p.number}` : p.number))
    .filter(Boolean)
    .join(", ");
}

/** Only render a line when the value is actually present. */
function line(label: string, value: string | null | undefined): string {
  const cleaned = (value ?? "").trim();
  return cleaned ? `${label}: ${cleaned}\n` : "";
}

// ── Patient: lab request created ─────────────────────────────────────────────

export function patientRequestCode(params: {
  patientName: string | null | undefined;
  labName: string;
  labAddress?: string | null;
  labPhones?: PhoneEntryLike[] | null;
  code: string;
  requestUrl?: string | null;
}): WhatsAppMessage {
  const phones = formatLabPhones(params.labPhones);

  const body =
    `${greeting(params.patientName)}your lab request at *${params.labName}* has been received.\n\n` +
    `*Request code:* ${params.code}\n` +
    line("*Address*", params.labAddress) +
    line("*Phone*", phones) +
    `\nShow this code at the lab reception.\n` +
    (params.requestUrl ? `Details: ${params.requestUrl}\n` : "") +
    `\n— Poveon Health`;

  return {
    body,
    contentSid: contentSidFor("requestCode"),
    contentVariables: {
      "1": v(firstName(params.patientName), "there"),
      "2": v(params.labName),
      "3": v(params.code),
      "4": v(params.labAddress, "See your email for the address"),
      "5": v(phones, "Not provided"),
      "6": v(params.requestUrl, "https://poveon.com"),
    },
  };
}

// ── Doctor: request confirmation ─────────────────────────────────────────────

export function doctorRequestConfirmation(params: {
  doctorName: string | null | undefined;
  patientName: string | null | undefined;
  labName: string;
  labAddress?: string | null;
  labPhones?: PhoneEntryLike[] | null;
  code: string;
  requestUrl?: string | null;
}): WhatsAppMessage {
  const phones = formatLabPhones(params.labPhones);
  const patient = params.patientName?.trim() || "Your patient";

  const body =
    `${greeting(params.doctorName)}your lab request for *${patient}* has been sent to *${params.labName}*.\n\n` +
    `*Request code:* ${params.code}\n` +
    line("*Lab address*", params.labAddress) +
    line("*Lab phone*", phones) +
    `\nThe patient has been sent this code by WhatsApp.\n` +
    (params.requestUrl ? `Track: ${params.requestUrl}\n` : "") +
    `\n— Poveon Health`;

  return {
    body,
    contentSid: contentSidFor("doctorRequest"),
    contentVariables: {
      "1": v(firstName(params.doctorName), "Doctor"),
      "2": v(patient),
      "3": v(params.labName),
      "4": v(params.code),
      "5": v(params.labAddress, "See your email for the address"),
      "6": v(phones, "Not provided"),
    },
  };
}

// ── Results ready ────────────────────────────────────────────────────────────

export function resultsReady(params: {
  recipientName: string | null | undefined;
  patientName: string;
  labName: string;
  code: string;
  resultLink?: string | null;
  /** Doctors get a clinical phrasing, patients a personal one. */
  isDoctor?: boolean;
}): WhatsAppMessage {
  const subject = params.isDoctor ? `for *${params.patientName}*` : "";
  const body = params.isDoctor
    ? `${greeting(params.recipientName)}lab results ${subject} (${params.code}) are ready at *${params.labName}*.\n` +
      (params.resultLink ? `\nView: ${params.resultLink}\n` : "\nThey have been emailed to you.\n") +
      `\n— Poveon Health`
    : `${greeting(params.recipientName)}your lab results from *${params.labName}* are ready.\n\n` +
      `*Request code:* ${params.code}\n` +
      (params.resultLink ? `View: ${params.resultLink}\n` : "They have been sent to your email.\n") +
      `\n— Poveon Health`;

  return {
    body,
    contentSid: contentSidFor("resultsReady"),
    contentVariables: {
      "1": v(firstName(params.recipientName), params.isDoctor ? "Doctor" : "there"),
      "2": v(params.patientName),
      "3": v(params.labName),
      "4": v(params.code),
      "5": v(params.resultLink, "Sent to your email"),
    },
  };
}

// ── Referrals ────────────────────────────────────────────────────────────────

export function referralCreatedPatient(params: {
  patientName: string;
  doctorName: string;
  hospitalName: string;
  specialty: string;
  code: string;
  trackUrl: string;
}): WhatsAppMessage {
  const body =
    `${greeting(params.patientName)}${params.doctorName} has referred you to *${params.hospitalName}* (${params.specialty}).\n\n` +
    `*Referral code:* ${params.code}\n` +
    `Present this code at the hospital.\n` +
    `Track: ${params.trackUrl}\n\n` +
    `— Poveon Health`;

  return {
    body,
    contentSid: contentSidFor("referralCreated"),
    contentVariables: {
      "1": v(firstName(params.patientName), "there"),
      "2": v(params.doctorName),
      "3": v(params.hospitalName),
      "4": v(params.specialty),
      "5": v(params.code),
      "6": v(params.trackUrl),
    },
  };
}

export function referralStatusUpdate(params: {
  recipientName: string;
  status: "accepted" | "rejected" | "redirected";
  code: string;
  hospitalName: string;
  newHospitalName?: string;
  trackUrl: string;
}): WhatsAppMessage {
  const statusLine = {
    accepted: `*${params.hospitalName}* has ACCEPTED your referral. You may proceed to the hospital with your code.`,
    rejected: `*${params.hospitalName}* could not accept your referral. Please contact your doctor for next steps.`,
    redirected: `Your referral was redirected to *${params.newHospitalName ?? "another hospital"}*.`,
  }[params.status];

  const body =
    `${greeting(params.recipientName)}update on referral *${params.code}*.\n\n` +
    `${statusLine}\n` +
    `Track: ${params.trackUrl}\n\n` +
    `— Poveon Health`;

  return {
    body,
    contentSid: contentSidFor("referralStatus"),
    contentVariables: {
      "1": v(firstName(params.recipientName), "there"),
      "2": v(params.code),
      // Strip markdown from the variable — templates carry their own formatting.
      "3": v(statusLine.replace(/\*/g, "")),
      "4": v(params.trackUrl),
    },
  };
}
