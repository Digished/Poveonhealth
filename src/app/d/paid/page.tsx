import { Suspense } from "react";
import Link from "next/link";
import { PoveonLogo } from "@/components/PoveonLogo";
import { EncounterPaymentResult } from "@/components/encounter/EncounterPaymentResult";

export const metadata = {
  title: "Confirming your payment — Poveon Health",
};

export default function EncounterPaidPage() {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-indigo-50 to-emerald-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/60 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <PoveonLogo className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 leading-tight truncate">Poveon Health</p>
              <p className="text-[11px] text-slate-400 leading-tight">Secure consultation</p>
            </div>
          </Link>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4">
        <Suspense fallback={<div className="py-20 text-center text-sm text-slate-400">Loading…</div>}>
          <EncounterPaymentResult />
        </Suspense>
      </main>
    </div>
  );
}
