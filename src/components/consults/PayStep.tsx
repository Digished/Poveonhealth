"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Check, Copy, CreditCard, Loader2, ShieldCheck } from "lucide-react";

/**
 * How a member pays to join.
 *
 * Most people here pay by transfer, and the old flow sent everyone out to a
 * hosted checkout to be told so — a page that loads slowly on a poor
 * connection, in an app that is not ours, at the exact moment someone is
 * deciding whether to bother. So the transfer happens here: an account number
 * on screen, copyable, with the app watching for the money. Card still goes to
 * Paystack, because a card form is theirs to host and ours to stay out of.
 *
 * Both routes end at the same place. The transfer's reference verifies through
 * the endpoint a card reference verifies through, so activation has one path
 * however the money arrived.
 */

type Transfer = {
  reference: string;
  bankName: string;
  accountNumber: string;
  accountName: string | null;
  expiresAt: string | null;
  amountNaira: number;
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/**
 * How long to wait before asking again whether the money has landed.
 *
 * Every check costs a call to Paystack, and a transfer usually settles in the
 * first minute — so the early checks are quick and the later ones are not.
 * A flat five seconds would be seven hundred calls over the hour the account
 * stays open, almost all of them after the member had given up and walked away.
 */
function pollDelay(attempt: number): number {
  if (attempt < 12) return 5_000; // the first minute, when it usually arrives
  if (attempt < 24) return 15_000; // the next three
  return 30_000;
}

export function PayStep({
  priceNaira,
  authorizationUrl,
  onPaid,
}: {
  priceNaira: number;
  /** The Paystack checkout for the card route, from registration. */
  authorizationUrl: string | null;
  /** Called once the payment has been verified and the plan is live. */
  onPaid: (result: { code: string | null }) => void;
}) {
  const [method, setMethod] = useState<"transfer" | "card" | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const paid = useRef(false);

  function copy(text: string, what: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1600);
    });
  }

  /** Ask whether the transfer has arrived. Safe to call as often as we like. */
  const checkPaid = useCallback(async (reference: string) => {
    if (paid.current) return true;
    try {
      const res = await fetch("/api/consults/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.success) {
        paid.current = true;
        onPaid({ code: d.code ?? d.member?.code ?? null });
        return true;
      }
    } catch {
      /* offline for a moment; the next tick tries again */
    }
    return false;
  }, [onPaid]);

  // Watch for the money while the account is on screen. Stops the moment it
  // lands, and on unmount, so a closed dialog is not still polling.
  useEffect(() => {
    if (!transfer) return;
    let live = true;
    let attempt = 0;
    const tick = async () => {
      if (!live) return;
      const done = await checkPaid(transfer.reference);
      if (!done && live) {
        attempt += 1;
        timer = setTimeout(tick, pollDelay(attempt));
      }
    };
    let timer = setTimeout(tick, pollDelay(attempt));
    return () => { live = false; clearTimeout(timer); };
  }, [transfer, checkPaid]);

  async function startTransfer() {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/consults/pay/transfer", { method: "POST" });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        setError(d?.error ?? "Could not set up a transfer just now.");
        // Transfers being unavailable is a reason to show the card route, not
        // to leave someone staring at an error.
        if (d?.card_available) setMethod("card");
        return;
      }
      setTransfer(d.transfer);
      setMethod("transfer");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  // ── Choosing ─────────────────────────────────────────────────────────────
  if (!transfer) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">To pay</p>
          <p className="mt-0.5 text-3xl font-black text-slate-900">{naira(priceNaira)}</p>
          <p className="mt-0.5 text-xs text-slate-500">Once, for twelve months</p>
        </div>

        <button
          onClick={startTransfer}
          disabled={starting}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-medical-500 bg-medical-50 p-4 text-left transition hover:bg-medical-100 disabled:opacity-60"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-medical-600 text-white">
            {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Building2 className="h-5 w-5" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-900">
              {starting ? "Getting your account…" : "Pay by bank transfer"}
            </span>
            <span className="block text-xs text-slate-600">
              We show you an account here. Transfer from your bank app.
            </span>
          </span>
        </button>

        {authorizationUrl && (
          <a
            href={authorizationUrl}
            className="flex w-full items-center gap-3 rounded-2xl border-2 border-slate-200 p-4 text-left transition hover:border-slate-300"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <CreditCard className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900">Pay by card</span>
              <span className="block text-xs text-slate-600">Opens Paystack&apos;s secure checkout.</span>
            </span>
          </a>
        )}

        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Payments are handled by Paystack.
        </p>
      </div>
    );
  }

  // ── Transferring ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-medical-100 bg-medical-50/60 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-medical-700">
          Transfer exactly
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-3xl font-black leading-none text-slate-900">
            {naira(transfer.amountNaira)}
          </p>
          <CopyButton
            label="Amount"
            copied={copied === "amount"}
            onClick={() => copy(String(Math.round(transfer.amountNaira)), "amount")}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 p-4">
        <Row label="Bank" value={transfer.bankName} />
        <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Account number
            </p>
            <p className="mt-0.5 font-mono text-2xl font-bold tracking-wider text-slate-900">
              {transfer.accountNumber}
            </p>
          </div>
          <CopyButton
            label="Number"
            copied={copied === "account"}
            onClick={() => copy(transfer.accountNumber, "account")}
          />
        </div>
        {transfer.accountName && (
          <div className="border-t border-slate-100 pt-2.5">
            <Row label="Account name" value={transfer.accountName} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 rounded-2xl bg-slate-50 px-4 py-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-medical-600" />
        <p className="text-xs leading-relaxed text-slate-600">
          Waiting for your transfer. This page updates on its own — you don&apos;t need to do
          anything else once you&apos;ve sent it.
        </p>
      </div>

      <button
        onClick={async () => {
          setChecking(true);
          const done = await checkPaid(transfer.reference);
          setChecking(false);
          if (!done) setError("We haven't seen it yet. Transfers can take a minute or two.");
        }}
        disabled={checking}
        className="w-full rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-60"
      >
        {checking ? "Checking…" : "I've sent it — check now"}
      </button>

      {error && <p className="text-center text-xs text-slate-500">{error}</p>}

      <p className="text-center text-[11px] leading-relaxed text-slate-400">
        This account is for this payment only. Send the exact amount from any bank app.
        {authorizationUrl && (
          <>
            {" "}
            <a href={authorizationUrl} className="font-semibold text-medical-600 hover:underline">
              Pay by card instead
            </a>
            .
          </>
        )}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function CopyButton({
  label, copied, onClick,
}: {
  label: string; copied: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-700 active:scale-95"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
