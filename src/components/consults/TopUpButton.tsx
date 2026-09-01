"use client";

/**
 * "Buy more messages" — shown once a member has spent the year's allowance.
 *
 * The allowance is not a paywall on care, it is a fair-use limit on one doctor's
 * time; a member who needs more should be able to buy more the same minute
 * rather than wait out the year. The purchase is only credited when Paystack
 * verifies it (see /api/consults/topup and creditTopup).
 */

import { useState } from "react";
import { Loader2, MessageCirclePlus } from "lucide-react";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export function TopUpButton({
  messages,
  priceNaira,
  className = "",
}: {
  messages: number;
  priceNaira: number;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function buy() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/consults/topup", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.authorization_url) {
        setError(data?.error ?? "We could not start that payment.");
        setBusy(false);
        return;
      }
      window.location.href = data.authorization_url;
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        onClick={buy}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-3 text-sm font-bold text-white shadow-lg shadow-medical-600/20 transition hover:bg-medical-700 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MessageCirclePlus className="h-4 w-4" />
        )}
        {busy ? "Opening checkout…" : `Buy ${messages} more messages · ${naira(priceNaira)}`}
      </button>
      {error && <p className="mt-2 text-center text-xs font-semibold text-red-500">{error}</p>}
    </div>
  );
}
