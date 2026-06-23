"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Copy, MessageSquareQuote, ShieldQuestion, ChevronDown, ChevronUp, Megaphone } from "lucide-react";
import { ELEVATOR_PITCH, OBJECTIONS, SCRIPTS, fillScript } from "@/lib/marketer/playbook-content";

export function MarketerPitch({ marketerName }: { marketerName: string }) {
  const [openObj, setOpenObj] = useState<number | null>(0);

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => toast.success("Copied"));
  }

  return (
    <div className="space-y-5">
      {/* Elevator pitch */}
      <section>
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg mb-2"><Megaphone className="w-4 h-4" /> 30-second pitch</div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-sm text-slate-700 leading-relaxed">{ELEVATOR_PITCH}</p>
          <button onClick={() => copy(ELEVATOR_PITCH)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"><Copy className="w-3.5 h-3.5" /> Copy</button>
        </div>
      </section>

      {/* Objections */}
      <section>
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg mb-2"><ShieldQuestion className="w-4 h-4" /> Handle the top objections</div>
        <div className="space-y-2">
          {OBJECTIONS.map((o, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => setOpenObj(openObj === i ? null : i)} className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
                <span className="text-sm font-semibold text-slate-800">“{o.objection}”</span>
                {openObj === i ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>
              {openObj === i && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-slate-600 leading-relaxed">{o.rebuttal}</p>
                  <button onClick={() => copy(o.rebuttal)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"><Copy className="w-3.5 h-3.5" /> Copy</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Scripts */}
      <section>
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-medical-600 bg-medical-50 px-2 py-1 rounded-lg mb-2"><MessageSquareQuote className="w-4 h-4" /> Message scripts</div>
        <div className="space-y-2">
          {SCRIPTS.map((s) => {
            const text = fillScript(s.body, { doctor: "Doctor", me: marketerName, detail: "the patient" });
            return (
              <div key={s.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-sm text-slate-700 leading-relaxed">{text}</p>
                <button onClick={() => copy(text)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"><Copy className="w-3.5 h-3.5" /> Copy</button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
