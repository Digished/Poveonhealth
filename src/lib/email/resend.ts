import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_ADDRESS = "Poveon <notifications@poveon.com>";

/**
 * Returns the "from" address for a lab's outgoing emails.
 * Uses the lab's branded email (notification_email) if set, otherwise defaults to Poveon email.
 *
 * Example: "XYZ Laboratory <hello@xyzlab.com>" or "XYZ Laboratory <notifications@poveon.com>"
 */
export function labSender(lab: { name: string; notification_email?: string | null }): string {
  if (lab.notification_email) {
    return `${lab.name} <${lab.notification_email}>`;
  }
  return `${lab.name} <notifications@poveon.com>`;
}

/**
 * Returns the full, de-duplicated list of recipient addresses that should be
 * alerted when a new request comes in for a lab.
 *
 * Combines the legacy singular `request_email` with the newer `request_emails`
 * array (added so a Poveon admin can configure multiple notification emails per
 * lab). Comparison is case-insensitive and empty values are dropped.
 */
export function labRequestRecipients(lab: {
  request_email?: string | null;
  request_emails?: unknown;
}): string[] {
  const candidates: string[] = [];
  if (lab.request_email) candidates.push(lab.request_email);
  if (Array.isArray(lab.request_emails)) {
    for (const entry of lab.request_emails) {
      if (typeof entry === "string" && entry.trim()) candidates.push(entry.trim());
    }
  }
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const email of candidates) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }
  return recipients;
}
