import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

// Use environment variables for flexibility; fallback to notifications@poveon.com
export const FROM_ADDRESS = `${process.env.FROM_NAME ?? "Poveon"} <${process.env.FROM_EMAIL ?? "notifications@poveon.com"}>`;

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
  return `${lab.name} <${process.env.FROM_EMAIL ?? "notifications@poveon.com"}>`;
}
