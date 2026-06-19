"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, Copy, Check, MapPin, Phone, RotateCcw, Link2, Smartphone, Share2, X } from "lucide-react";
import { parsePhones } from "@/lib/phones";
import type { PhoneEntry } from "@/lib/phones";

function parseWhatsapp(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    const numbers = Array.isArray(p) ? p : [raw];
    return numbers.filter((n: string) => n && n.trim() && /\d/.test(n));
  } catch {
    return raw && raw.trim() && /\d/.test(raw) ? [raw] : [];
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [presentOpen, setPresentOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Lock body scroll while the full-screen "show to patient" view is open.
  useEffect(() => {
    if (!presentOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [presentOpen]);

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

  const phones = parsePhones(labPhones as unknown);
  const wa = parseWhatsapp(labWhatsapp);

  async function copyLink() {
    const url = `${window.location.origin}/r/${code}`;
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
  }

  // Native share when available (WhatsApp/SMS/etc.), else fall back to copying the link.
  async function sendToPatient() {
    const url = `${window.location.origin}/r/${code}`;
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({
          title: "Your lab test code",
          text: `Code ${code} for ${labName || "your lab test"}. Show it at the lab.`,
          url,
        });
        return;
      } catch {
        // user cancelled or share failed — fall through to copy
      }
    }
    await copyLink();
  }

  return (
    <div className="animate-slide-up space-y-4 pt-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Request Submitted</h2>
        <p className="text-sm text-slate-500 mt-1">Show or send the code to your patient.</p>
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

        {/* Sharing actions */}
        <button
          onClick={() => setPresentOpen(true)}
          className="mt-3 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-medical-600 hover:bg-medical-700 active:scale-[0.99] text-white text-sm font-bold shadow-sm shadow-medical-600/30 transition-all"
        >
          <Smartphone className="w-4 h-4" />
          Show to patient
        </button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={sendToPatient}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-medical-200 bg-white hover:bg-medical-50 text-xs font-semibold text-medical-700 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            Send to patient
          </button>
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-medical-200 bg-white hover:bg-medical-50 text-xs font-semibold text-medical-700 transition-colors"
          >
            {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
            {linkCopied ? "Link copied!" : "Copy link"}
          </button>
        </div>
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
          {(phones.length > 0 || wa.length > 0) && (
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-slate-100 mt-1">
              {phones.map((ph, i) => (
                <a key={i} href={`tel:${ph.number}`} className="flex items-center gap-1.5 text-xs font-medium text-medical-600 hover:underline">
                  <Phone className="w-3 h-3 shrink-0" />
                  {ph.label && <span className="text-slate-400">{ph.label}:</span>}
                  {ph.number}
                </a>
              ))}
              {wa.map((num, i) => (
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

      {/* ── Full-screen "Show to patient" view — built to be photographed ── */}
      {mounted && presentOpen && createPortal(
        <div className="fixed inset-0 z-[10000] bg-white flex flex-col animate-fade-in" style={{ minHeight: "100dvh" }}>
          <button
            onClick={() => setPresentOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.25em] mb-4">Show this at the lab</p>

            {/* The code — the focal point, sized for a clear photo */}
            <p className="text-5xl sm:text-6xl font-black text-slate-900 font-mono tracking-[0.12em] leading-none break-all">
              {code}
            </p>

            {/* Lab block */}
            {labName && (
              <div className="mt-7 max-w-sm">
                <p className="text-lg font-bold text-slate-900">{labName}</p>
                {labAddress && (
                  <p className="mt-1 text-sm text-slate-600 flex items-start justify-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <span>{labAddress}</span>
                  </p>
                )}
                {phones.length > 0 && (
                  <div className="mt-2 flex flex-col items-center gap-0.5">
                    {phones.map((ph, i) => (
                      <p key={i} className="text-base font-semibold text-slate-800 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {ph.label && <span className="text-slate-400 font-normal">{ph.label}:</span>}
                        {ph.number}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Typeable fallback for phones without a camera */}
            <p className="mt-6 text-sm text-slate-500">
              Track online: <span className="font-semibold text-slate-700">{mounted ? window.location.host : ""}/r/{code}</span>
            </p>

            <p className="mt-8 text-sm font-semibold text-medical-700 bg-medical-50 border border-medical-100 rounded-full px-4 py-2">
              📸 Snap a photo of this screen to keep it
            </p>

            <p className="mt-4 text-xs text-slate-400">
              {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
