/**
 * SMS Module - Provider-agnostic interface
 * Dynamically selects provider based on SMS_PROVIDER environment variable
 */

import { smsProvider } from "./config";

export async function sendSms(to: string, message: string): Promise<{ messageId?: string }> {
  return smsProvider.sendSms(to, message);
}

export function buildPatientRequestSms(params: {
  patientName: string;
  labName: string;
  code: string;
}): string {
  return smsProvider.buildPatientRequestSms(params);
}
