import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_ADDRESS = "Poveon <notifications@poveon.com>";

/**
 * Returns the "from" address for a lab's outgoing emails.
 * Always sends from notifications@poveon.com but with the lab name as the display name.
 * This makes emails appear to come from the lab while keeping the unified inbox.
 *
 * Example: "XYZ Laboratory <notifications@poveon.com>"
 */
export function labSender(lab: { name: string }): string {
  return `${lab.name} <notifications@poveon.com>`;
}
