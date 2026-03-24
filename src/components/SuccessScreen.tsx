"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Copy, Check, MapPin, Phone, RotateCcw } from "lucide-react";

interface SuccessScreenProps {
  code: string;
  requestId?: string;
  labName: string;
  labAddress: string;
  labPhones?: string[];
  onReset: () => void;
}

export function SuccessScreen({
  code,
  labName,
  labAddress,
  labPhones = [],
  onReset,
}: SuccessScreenProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const el = document.createElement("textarea");
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div className="animate-slide-up space-y-4 pt-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Request Submitted</h2>
        <p className="text-sm text-slate-500 mt-1">Share the code below with your patient.</p>
      </div>

      {/* Code card */}
      <div className="bg-medical-50 border border-medical-200 rounded-2xl px-5 py-4">
        <p className="text-[10px] font-bold text-medical-500 uppercase tracking-widest text-center mb-2">Patient Code</p>
        <div className="flex items-center justify-center gap-3">
          <span className="text-3xl font-black text-medical-700 tracking-[0.2em] font-mono">
            {code}
          </span>
          <button
            onClick={copyCode}
            className="p-2 rounded-xl bg-white border border-medical-200 hover:bg-medical-100 transition-colors"
            title={copied ? "Copied!" : "Copy code"}
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy className="w-4 h-4 text-medical-600" />
            )}
          </button>
        </div>
        {copied && <p className="text-center text-xs text-emerald-600 font-medium mt-1.5">Copied!</p>}
      </div>

      {/* Lab info */}
      {labName && (
        <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3.5 space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Laboratory</p>
          <p className="text-sm font-bold text-slate-800">{labName}</p>
          {labAddress && (
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-500">{labAddress}</p>
            </div>
          )}
          {labPhones.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {labPhones.map((ph, i) => (
                <a key={i} href={`tel:${ph}`} className="flex items-center gap-1 text-xs font-medium text-medical-600 hover:underline">
                  <Phone className="w-3 h-3 shrink-0" />{ph}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Next steps */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">What happens next</p>
        <ol className="space-y-2">
          {[
            "A confirmation email has been sent to your inbox.",
            "Share the code with your patient — they may have received it too.",
            "Patient presents the code at the lab reception.",
            "You'll be notified when they arrive and when tests are done.",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-xs text-slate-600">{step}</p>
            </li>
          ))}
        </ol>
      </div>

      <button
        onClick={onReset}
        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Submit another request
      </button>
    </div>
  );
}
