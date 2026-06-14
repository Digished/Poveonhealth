"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, XCircle, RefreshCw, CheckCircle2, Copy } from "lucide-react";
import { toast } from "react-hot-toast";

const PLAN_LABEL: Record<string, string> = {
  single: "Single encounter",
  monthly: "Monthly retainership",
  yearly: "Yearly retainership",
};

export function EncounterPaymentResult() {
  const params = useSearchParams();
  const reference = params.get("reference") || params.get("trxref");

  const [state, setState] = useState<"verifying" | "success" | "failed">("verifying");
  const [code, setCode] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const verify = useCallback(async () => {
    if (!reference) { setState("failed"); return; }
    setState("verifying");
    try {
      const res = await fetch(`/api/encounter/verify?reference=${encodeURIComponent(reference)}`);
      const data = await res.json();
      if (res.ok && data.success && data.paid) {
        setCode(data.code);
        setPlan(data.plan_type ?? null);
        setState("success");
      } else {
        setState("failed");
      }
    } catch {
      setState("failed");
    }
  }, [reference]);

  useEffect(() => { verify(); }, [verify, attempt]);

  if (state === "success" && code) {
    return (
      <div className="py-16 text-center max-w-md mx-auto px-2 animate-fade-in">
        <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-9 h-9 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">You&apos;re all set</h2>
        <p className="text-sm text-slate-500 mt-2">
          Your payment is confirmed and your doctor has been notified with your answers.
          {plan && plan !== "single" ? ` Your ${PLAN_LABEL[plan]?.toLowerCase()} is now active.` : ""} You&apos;ll also
          get a confirmation email.
        </p>
        <div className="mt-6 bg-medical-50 border-2 border-dashed border-medical-300 rounded-2xl p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-medical-600">Your reference code</p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="text-2xl font-black tracking-[3px] text-medical-700 font-mono">{code}</p>
            <button
              onClick={() => { navigator.clipboard.writeText(code).then(() => toast.success("Copied")); }}
              className="text-medical-500 hover:text-medical-700 p-1" aria-label="Copy code"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
        <Link href="/" className="inline-block mt-6 text-sm font-semibold text-medical-600 hover:text-medical-700">
          Done →
        </Link>
      </div>
    );
  }

  if (state === "verifying") {
    return (
      <div className="py-24 text-center">
        <Loader2 className="w-8 h-8 text-medical-500 animate-spin mx-auto mb-4" />
        <p className="text-sm font-medium text-slate-600">Confirming your payment…</p>
        <p className="text-xs text-slate-400 mt-1">This only takes a moment.</p>
      </div>
    );
  }

  return (
    <div className="py-20 text-center max-w-md mx-auto px-2">
      <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <XCircle className="w-7 h-7 text-red-500" />
      </div>
      <h2 className="text-lg font-bold text-slate-800">We couldn&apos;t confirm your payment yet</h2>
      <p className="text-sm text-slate-500 mt-1.5">
        If you completed the payment, it may take a few seconds to reflect. You can retry, or if you were
        charged, contact support with your payment reference and we&apos;ll sort it out.
      </p>
      {reference && <p className="text-xs text-slate-400 mt-2 font-mono break-all">Ref: {reference}</p>}
      <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
        <button onClick={() => setAttempt((a) => a + 1)} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 text-white text-sm font-semibold transition">
          <RefreshCw className="w-4 h-4" /> Retry confirmation
        </button>
        <Link href="/" className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition">
          Go home
        </Link>
      </div>
    </div>
  );
}
