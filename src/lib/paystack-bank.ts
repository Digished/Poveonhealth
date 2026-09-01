/**
 * Confirming, with the bank, that a payout account is what someone typed.
 *
 * A wrong account number is not a form error — it is money sent to a stranger,
 * discovered weeks later when a pharmacy asks where their settlement went. So
 * the account *name* is never taken from whoever filled the form in: it is
 * resolved from the bank and stored as the bank gave it. Typing "HealthPlus
 * Ikeja" into a box proves nothing; the bank replying "HEALTHPLUS PHARMACY
 * LIMITED" proves the account exists and hints strongly at whose it is.
 *
 * Everything here degrades rather than blocks. Paystack being unconfigured or
 * unreachable must not stop an admin setting a pharmacy up — it only means the
 * name is recorded unverified, and the caller is told which it was.
 */

const PAYSTACK = "https://api.paystack.co";

export type ResolvedAccount =
  | { ok: true; name: string; number: string }
  | { ok: false; reason: "unconfigured" | "not_found" | "unavailable"; message: string };

/** Ask the bank who owns this account. */
export async function resolveAccountName(
  bankCode: string,
  accountNumber: string
): Promise<ResolvedAccount> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Bank verification is not switched on, so the name could not be confirmed.",
    };
  }
  if (!/^\d{10}$/.test(accountNumber) || !bankCode) {
    return { ok: false, reason: "not_found", message: "An account number is 10 digits." };
  }

  try {
    const url =
      `${PAYSTACK}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}` +
      `&bank_code=${encodeURIComponent(bankCode)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.status || !data?.data?.account_name) {
      // Paystack answers a wrong number and a rate limit with the same shape,
      // so the two are told apart by status rather than by message.
      if (res.status === 422 || res.status === 400) {
        return {
          ok: false,
          reason: "not_found",
          message: "No account with that number at that bank. Check both and try again.",
        };
      }
      return {
        ok: false,
        reason: "unavailable",
        message: "The bank could not be reached just now. Try again in a moment.",
      };
    }

    return {
      ok: true,
      name: String(data.data.account_name),
      number: String(data.data.account_number ?? accountNumber),
    };
  } catch {
    return {
      ok: false,
      reason: "unavailable",
      message: "The bank could not be reached just now. Try again in a moment.",
    };
  }
}

/**
 * The Paystack subaccount a pharmacy's share of a member's payment is split to.
 *
 * `percentage_charge` is set to 100 deliberately: every medication order names
 * its own flat `transaction_charge` in kobo, worked out to the kobo by
 * lib/med-pricing.ts, and that overrides the subaccount's percentage. Setting a
 * percentage here would only matter if a charge ever forgot to, and 100 (all of
 * it to Poveon) is the safe way to be wrong — money held rather than money
 * gone.
 */
export async function upsertPharmacySubaccount(params: {
  existingCode: string | null;
  businessName: string;
  bankCode: string;
  accountNumber: string;
}): Promise<string | null> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return params.existingCode;

  try {
    const url = params.existingCode
      ? `${PAYSTACK}/subaccount/${encodeURIComponent(params.existingCode)}`
      : `${PAYSTACK}/subaccount`;
    const res = await fetch(url, {
      method: params.existingCode ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: params.businessName,
        settlement_bank: params.bankCode,
        account_number: params.accountNumber,
        percentage_charge: 100,
      }),
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json().catch(() => null);
    if (!data?.status || !data?.data?.subaccount_code) {
      console.error("[paystack] pharmacy subaccount upsert failed:", JSON.stringify(data));
      // Keep whatever worked before rather than wiping a working payout route.
      return params.existingCode;
    }
    return String(data.data.subaccount_code);
  } catch (e) {
    console.error("[paystack] pharmacy subaccount error:", e);
    return params.existingCode;
  }
}
