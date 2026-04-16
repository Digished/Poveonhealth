/**
 * SMS Provider Configuration
 * Active provider: Termii (DND channel, sender ID: N-Alert)
 */

import * as termii from "./termii";

export type SMSProvider = "termii";

export const smsProvider = termii;
