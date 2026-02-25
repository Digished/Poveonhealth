"use client";

import { useState } from "react";
import { Shield, Clock, Mail, X } from "lucide-react";

const ITEMS = [
  {
    icon: Shield,
    title: "Secure",
    detail:
      "Every request is transmitted over TLS-encrypted connections. Your patient data and doctor credentials are never stored in plain text, and access is strictly scoped to authorised parties only.",
  },
  {
    icon: Clock,
    title: "Instant",
    detail:
      "Lab staff are notified in real time the moment a request is submitted. No faxes, no waiting — the right people see the right information immediately, so samples can be prepared without delay.",
  },
  {
    icon: Mail,
    title: "Notified",
    detail:
      "You and the lab receive email confirmations at every key stage — submission, acceptance, and result dispatch — so nothing falls through the cracks and everyone stays in the loop.",
  },
];

export function TrustIndicators() {
  const [active, setActive] = useState<(typeof ITEMS)[0] | null>(null);

  return (
    <>
      <div className="mt-10 grid grid-cols-3 gap-3">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              onClick={() => setActive(item)}
              className="group flex flex-col items-center gap-2 p-4 bg-white/60 hover:bg-white/90 rounded-2xl border border-white/80 hover:border-medical-100 hover:shadow-sm transition-all duration-200 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-medical-50 group-hover:bg-medical-100 flex items-center justify-center transition-colors">
                <Icon className="w-4.5 h-4.5 text-medical-600 w-[18px] h-[18px]" />
              </div>
              <p className="text-xs font-semibold text-slate-700">{item.title}</p>
            </button>
          );
        })}
      </div>

      {/* Modal */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-backdrop-in"
          style={{ backgroundColor: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
          onClick={() => setActive(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-medical-50 to-sky-50 px-6 pt-6 pb-5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0">
                <active.icon className="w-6 h-6 text-medical-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-800">{active.title}</h3>
              </div>
              <button
                onClick={() => setActive(null)}
                className="p-1.5 rounded-xl hover:bg-white/60 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 leading-relaxed">{active.detail}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
