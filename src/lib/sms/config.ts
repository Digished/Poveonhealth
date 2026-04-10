/**
 * SMS Provider Configuration
 * Using Twilio - reliable, simple, works everywhere
 */

import * as twilio from "./twilio";

export type SMSProvider = "twilio";

export const smsProvider = twilio;
