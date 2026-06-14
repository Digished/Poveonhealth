import Link from "next/link";
import { PoveonLogo } from "@/components/PoveonLogo";
import { ReferralComposer } from "@/components/referral/ReferralComposer";

export const metadata = {
  title: "Write a Patient Referral — Poveon Health",
  description:
    "Write and send a patient referral letter to a hospital on the Poveon referral network. No login required to write — verify with your doctor email and PIN to send.",
};

export default function ReferPage() {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/60 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <PoveonLogo className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 leading-tight truncate">Patient Referral</p>
              <p className="text-[11px] text-slate-400 leading-tight">Poveon Referral Network</p>
            </div>
          </Link>
          <Link
            href="/refer/track"
            className="text-xs font-semibold text-medical-600 hover:text-medical-800 transition shrink-0"
          >
            Track a referral →
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4">
        <ReferralComposer />
      </main>
    </div>
  );
}
