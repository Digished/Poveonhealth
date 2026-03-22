"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Copy, Check, MapPin, Phone, RotateCcw, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
  requestId,
  labName,
  labAddress,
  labPhones = [],
  onReset,
}: SuccessScreenProps) {
  const [copied, setCopied] = useState(false);

  // Scroll to top when success screen mounts
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  }

  return (
    <div className="animate-slide-up text-center pt-10 sm:pt-14">
      {/* Success icon */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-medical-600 rounded-full flex items-center justify-center">
            <FlaskConical className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-slate-800 mb-2">
        Request Submitted!
      </h2>
      <p className="text-slate-500 mb-8 max-w-sm mx-auto">
        Your laboratory request has been registered. Share the code below with your patient.
      </p>

      {/* Code display */}
      <div className="glass-card p-6 mb-6 text-left">
        <p className="text-xs font-semibold text-medical-600 uppercase tracking-widest mb-3 text-center">
          Patient Request Code
        </p>
        <div className="flex items-center gap-3 bg-medical-50 border-2 border-dashed border-medical-300 rounded-xl p-4">
          <span className="flex-1 text-3xl font-black text-medical-700 tracking-[0.2em] font-mono text-center">
            {code}
          </span>
          <button
            onClick={copyCode}
            className="shrink-0 p-2 rounded-lg bg-white border border-medical-200 hover:bg-medical-50 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <Check className="w-5 h-5 text-emerald-600" />
            ) : (
              <Copy className="w-5 h-5 text-medical-600" />
            )}
          </button>
        </div>
        {copied && (
          <p className="text-center text-sm text-emerald-600 font-medium mt-2">
            Copied to clipboard!
          </p>
        )}
      </div>

      {/* Lab info */}
      {labName && (
        <div className="glass-card p-5 mb-8 text-left">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            Destination Laboratory
          </h3>
          <p className="font-semibold text-medical-700 mb-2">{labName}</p>
          {labAddress && (
            <div className="flex items-start gap-2 mt-1">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-600">{labAddress}</p>
            </div>
          )}
          {labPhones.length > 0 && (
            <div className="space-y-1 mt-2 pt-2 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 mb-1">Contact Numbers</p>
              {labPhones.map((ph, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <a href={`tel:${ph}`} className="text-sm text-medical-600 hover:underline font-medium">{ph}</a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-8 text-left">
        <h3 className="text-sm font-semibold text-blue-800 mb-3">
          Next Steps
        </h3>
        <ol className="space-y-2">
          {[
            "A confirmation email has been sent to your inbox with the code and lab details.",
            "Share the code with your patient — they may also have received it by email.",
            "The patient presents this code at the laboratory reception.",
            "You will receive email notifications when the patient arrives and when tests are complete.",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-blue-700">{step}</p>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button variant="ghost" onClick={onReset} className="gap-2">
          <RotateCcw className="w-4 h-4" />
          Submit another request
        </Button>
      </div>
    </div>
  );
}
