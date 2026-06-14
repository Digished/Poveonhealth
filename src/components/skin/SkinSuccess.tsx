"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, AlertTriangle } from "lucide-react";

/** Shared success screen shown after a free submission or a verified payment. */
export function SkinSuccessScreen({ code, patientName }: { code: string; patientName?: string }) {
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    try { await navigator.clipboard.writeText(code); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }
  const firstName = patientName?.trim().split(" ")[0];
  return (
    <div className="animate-slide-up space-y-4 pt-6 pb-12">
      <div className="text-center py-2">
        <div className="w-16 h-16 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Consultation Submitted!</h2>
        <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">
          Thanks{firstName ? `, ${firstName}` : ""}. A dermatologist will review your photos and
          reach out to you on WhatsApp. Please keep your phone handy.
        </p>
      </div>

      <div className="glass-card p-5">
        <p className="text-[10px] font-bold text-medical-500 uppercase tracking-widest text-center mb-2">
          Reference Code
        </p>
        <div className="flex items-center justify-center gap-3">
          <p className="text-3xl sm:text-4xl font-black text-medical-700 font-mono tracking-[0.12em] py-1 break-all text-center">
            {code}
          </p>
          <button
            onClick={copyCode}
            className="p-2 rounded-xl bg-medical-50 border border-medical-200 hover:bg-medical-100 transition-colors shrink-0"
            title={copied ? "Copied!" : "Copy code"}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-medical-600" />}
          </button>
        </div>
        <p className="text-xs text-center text-slate-500 mt-2">Keep this code for your records.</p>
      </div>

      <div className="glass-card p-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">What happens next</p>
        <ol className="space-y-3">
          {[
            "A dermatologist reviews your photos and answers.",
            "They reach out to you on WhatsApp to follow up and advise.",
            "You'll also get a confirmation email with your reference code.",
          ].map((txt, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-medical-100 text-medical-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{txt}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 leading-relaxed">
          This service is not for emergencies. If your condition is rapidly worsening, you have a
          high fever, difficulty breathing, or widespread blistering, please seek urgent in-person care.
        </p>
      </div>

      <Link href="/" className="block text-center text-sm font-semibold text-medical-600 hover:text-medical-700 py-2.5 rounded-xl hover:bg-medical-50 transition-colors">
        Back to home
      </Link>
    </div>
  );
}
