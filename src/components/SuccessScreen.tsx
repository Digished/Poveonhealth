"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Copy, Check, MapPin, Phone, RotateCcw } from "lucide-react";
import { parsePhones } from "@/lib/phones";
import type { PhoneEntry } from "@/lib/phones";

function parseWhatsapp(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter(Boolean) : [raw];
  } catch {
    return [raw];
  }
}

interface SuccessScreenProps {
  code: string;
  requestId?: string;
  labName: string;
  labAddress: string;
  labPhones?: PhoneEntry[];
  labWhatsapp?: string | null;
  onReset: () => void;
}

export function SuccessScreen({
  code,
  labName,
  labAddress,
  labPhones = [],
  labWhatsapp,
  onReset,
}: SuccessScreenProps) {
  const waNumbers = parseWhatsapp(labWhatsapp);
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
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(labName + " " + labAddress)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1.5 group"
            >
              <MapPin className="w-3.5 h-3.5 text-medical-400 mt-0.5 shrink-0" />
              <p className="text-xs text-medical-600 group-hover:underline">{labAddress}</p>
            </a>
          )}
          {(labPhones.length > 0 || waNumbers.length > 0) && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100 mt-1">
              {parsePhones(labPhones).map((ph, i) => (
                <a key={i} href={`tel:${ph.number}`} className="flex items-center gap-1.5 text-xs font-medium text-medical-600 hover:underline">
                  <Phone className="w-3 h-3 shrink-0" />
                  {ph.label && <span className="text-slate-400">{ph.label}:</span>}
                  {ph.number}
                </a>
              ))}
              {waNumbers.map((num, i) => (
                <a
                  key={i}
                  href={`https://wa.me/${num.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:underline"
                >
                  <svg className="w-3 h-3 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.849L.057 23.986l6.306-1.447A11.946 11.946 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.019-1.378l-.36-.213-3.742.858.892-3.632-.234-.374A9.818 9.818 0 1112 21.818z"/></svg>
                  WhatsApp: {num}
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
