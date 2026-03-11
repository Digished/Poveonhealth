import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_ADDRESS = `${process.env.FROM_NAME ?? "Poveon"} <${process.env.FROM_EMAIL ?? "notifications@poveon.com"}>`;

/**
 * Returns the correct "from" address for a lab's outgoing emails.
 * If the lab has a custom notification_email set (e.g. no-reply@foremost.com),
 * that address is used so the email appears to come from the lab.
 * Falls back to the platform default (notifications@poveon.com).
 *
 * NOTE: Custom addresses must be verified in Resend before use.
 */
export function labSender(lab: { name: string; notification_email?: string | null }): string {
  if (lab.notification_email) return `${lab.name} <${lab.notification_email}>`;
  return FROM_ADDRESS;
}
