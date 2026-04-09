/**
 * SMS Provider Configuration
 * Switch between providers by changing SMS_PROVIDER environment variable
 */

import * as termii from "./termii";
import * as sendchamp from "./sendchamp";

export type SMSProvider = "termii" | "sendchamp";

const ACTIVE_PROVIDER: SMSProvider = (process.env.SMS_PROVIDER as SMSProvider) || "sendchamp";

export function getSmsProvider() {
  switch (ACTIVE_PROVIDER) {
    case "termii":
      return termii;
    case "sendchamp":
      return sendchamp;
    default:
      console.warn(`[sms] Unknown provider: ${ACTIVE_PROVIDER}, defaulting to sendchamp`);
      return sendchamp;
  }
}

export const smsProvider = getSmsProvider();
