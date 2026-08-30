"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Copy, Loader2, ShieldAlert, ArrowRight, MessageCircle } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";

/** Paystack returns here with ?reference=… — we confirm it and show the card. */
function PaidInner() {
  const params = useSearchParams();
  const router = useRouter();
  const reference = params.get("reference") ?? params.get("trxref") ?? "";

  const [state, setState] = useState<"checking" | "done" | "failed">("checking");
  const [error, setError] = useState("");
  const [member, setMember] = useState<{ code: string; full_name: string; doctor_assigned: boolean } | null>(null);
  const [topup, setTopup] = useState<{ messages: number; full_name: string; messages_left: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const confirm = useCallback(async () => {
    if (!reference) {
      setState("failed");
      setError("We couldn't find a payment reference in that link.");
      return;
    }
    setState("checking");
    try {
      const res = await fetch("/api/consults/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setState("failed");
        setError(data.error ?? "We couldn't confirm that payment.");
        return;
      }
      if (data.kind === "topup") setTopup(data.topup);
      else setMember(data.member);
      setState("done");
    } catch {
      setState("failed");
      setError("Network error while confirming your payment.");
    }
  }, [reference]);

  useEffect(() => { confirm(); }, [confirm]);

  function copyCode() {
    if (!member) return;
    navigator.clipboard.writeText(member.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-sky-50 via-white to-emerald-50/60 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <PoveonLogo className="h-6 w-6 text-medical-600" />
          <span className="text-lg font-bold text-slate-900">Poveon</span>
        </div>

        {state === "checking" && (
          <div className="rounded-3xl border border-white/70 bg-white/90 p-10 text-center shadow-xl backdrop-blur">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-medical-500" />
            <p className="mt-4 text-sm font-semibold text-slate-700">Confirming your payment…</p>
            <p className="mt-1 text-xs text-slate-400">This usually takes a second or two.</p>
          </div>
        )}

        {state === "failed" && (
          <div className="rounded-3xl border border-red-100 bg-white p-8 text-center shadow-xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
              <ShieldAlert className="h-6 w-6 text-red-500" />
            </div>
            <h1 className="mt-4 text-lg font-bold text-slate-900">We couldn&apos;t confirm that</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={confirm}
                className="w-full rounded-xl bg-medical-600 py-3 text-sm font-bold text-white transition hover:bg-medical-700"
              >
                Try again
              </button>
              <Link
                href="/dashboard?care=1"
                className="block w-full rounded-xl border border-slate-200 py-3 text-center text-sm font-semibold text-slate-600 transition hover:border-slate-300"
              >
                Back to my dashboard
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              If money left your account, email support@poveon.com with this reference:{" "}
              <span className="font-mono">{reference || "—"}</span>
            </p>
          </div>
        )}

        {state === "done" && topup && (
          <div className="animate-scale-in overflow-hidden rounded-3xl border border-white/70 bg-white shadow-xl">
            <div className="bg-gradient-to-br from-medical-500 to-medical-700 px-6 py-8 text-center text-white">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                <MessageCircle className="h-7 w-7" />
              </div>
              <h1 className="mt-3 text-xl font-bold">
                {topup.messages} more messages added
              </h1>
              <p className="mt-1 text-sm text-white/80">
                {topup.full_name ? `Thanks, ${topup.full_name.split(" ")[0]}. ` : ""}
                You can keep talking to your doctor.
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-2xl border border-medical-100 bg-medical-50 p-5 text-center">
                <p className="text-[11px] font-bold uppercase tracking-widest text-medical-600">
                  Messages left
                </p>
                <p className="mt-1 text-3xl font-extrabold text-medical-800">{topup.messages_left}</p>
              </div>
              <button
                onClick={() => router.push("/dashboard?tab=care")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-medical-600/25 transition hover:bg-medical-700"
              >
                Back to my care plan
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {state === "done" && member && (
          <div className="animate-scale-in overflow-hidden rounded-3xl border border-white/70 bg-white shadow-xl">
            <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 px-6 py-8 text-center text-white">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                <Check className="h-7 w-7" />
              </div>
              <h1 className="mt-3 text-xl font-bold">You&apos;re in, {member.full_name.split(" ")[0]}</h1>
              <p className="mt-1 text-sm text-white/80">Your care plan is active for the next 12 months.</p>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-2xl border-2 border-dashed border-medical-300 bg-medical-50 p-5 text-center">
                <p className="text-[11px] font-bold uppercase tracking-widest text-medical-600">Your care code</p>
                <p className="mt-1 font-mono text-3xl font-extrabold tracking-widest text-medical-800">{member.code}</p>
                <button
                  onClick={copyCode}
                  className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-medical-700 shadow-sm transition hover:bg-medical-100"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy code"}
                </button>
              </div>

              <p className="text-center text-sm text-slate-500">
                {member.doctor_assigned
                  ? "We've matched you with a doctor — they'll send your first assessment shortly."
                  : "We're matching you with a doctor now and will email you as soon as they're assigned."}
              </p>

              <button
                onClick={() => router.push("/dashboard?tab=care")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-medical-600/25 transition hover:bg-medical-700"
              >
                Open my care plan
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-center text-xs text-slate-400">
                We&apos;ve emailed your code and receipt too.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConsultsPaidPage() {
  return (
    <Suspense>
      <PaidInner />
    </Suspense>
  );
}
