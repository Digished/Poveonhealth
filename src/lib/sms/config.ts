/**
 * SMS Provider Configuration
 * Using Sendchamp only
 */

import * as sendchamp from "./sendchamp";

export type SMSProvider = "sendchamp";

export const smsProvider = sendchamp;
