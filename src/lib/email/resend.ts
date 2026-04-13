import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

// Use notifications@poveon.com for all emails (verified in Resend)
export const FROM_ADDRESS = "Poveon <notifications@poveon.com>";

/**
 * Returns the "from" address for a lab's outgoing emails.
 * All emails come from notifications@poveon.com to avoid domain verification issues.
 * The lab name is included in the email subject/body for context.
 */
export function labSender(lab: { name: string; notification_email?: string | null }): string {
  // Always use notifications@poveon.com - it's verified and reliable
  return FROM_ADDRESS;
}
