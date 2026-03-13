"use client";

import { useState } from "react";
import { Shield, Clock, Mail, X, Sparkles, ChevronRight } from "lucide-react";

const FEATURES = [
  {
    icon: Shield,
    title: "Secure",
    subtitle: "End-to-end encrypted",
    detail:
      "Every request is transmitted over TLS-encrypted connections. Your patient data and doctor credentials are never stored in plain text, and access is strictly scoped to authorised parties only.",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    icon: Clock,
    title: "Instant",
    subtitle: "Real-time lab notification",
    detail:
      "Lab staff are notified in real time the moment a request is submitted. No faxes, no waiting — the right people see the right information immediately, so samples can be prepared without delay.",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    badgeBg: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    icon: Mail,
    title: "Notified",
    subtitle: "Email updates at every stage",
    detail:
      "You and the lab receive email confirmations at every key stage — submission, acceptance, and result dispatch — so nothing falls through the cracks and everyone stays in the loop.",
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-600",
    badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
];

export function TrustIndicators() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Single Features button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex items-center gap-2.5 px-5 py-2.5 bg-white/70 hover:bg-white/90 border border-white/80 hover:border-slate-200 rounded-2xl shadow-sm hover:shadow transition-all duration-200"
        >
          <div className="flex -space-x-1.5">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 border-white ${f.iconBg}`}
                >
                  <Icon className={`w-3 h-3 ${f.iconColor}`} />
                </div>
              );
            })}
          </div>
          <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
            Features
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
        </button>
      </div>

      {/* Features modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-backdrop-in"
          style={{ backgroundColor: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm h-[90dvh] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 pt-4 pb-4 flex items-center justify-between border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-medical-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 leading-tight">How Poveon works</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Built for clinicians, trusted by labs</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Feature list — fills remaining height */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="flex gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${f.iconBg}`}>
                      <Icon className={`w-6 h-6 ${f.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <p className="text-sm font-bold text-slate-800">{f.title}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${f.badgeBg}`}>
                          {f.subtitle}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 leading-relaxed">{f.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
