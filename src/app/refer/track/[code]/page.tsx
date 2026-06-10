import Link from "next/link";
import { PoveonLogo } from "@/components/PoveonLogo";
import { ReferralTracker } from "@/components/referral/ReferralTracker";

export const metadata = {
  title: "Track a Referral — Poveon Health",
  description: "Track the status of a patient referral on the Poveon referral network.",
};

interface Props {
  params: { code: string };
}

export default function ReferralTrackPage({ params }: Props) {
  const code = decodeURIComponent(params.code ?? "").trim();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/60 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <PoveonLogo className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 leading-tight truncate">Referral Tracking</p>
              <p className="text-[11px] text-slate-400 leading-tight">Poveon Referral Network</p>
            </div>
          </Link>
          <Link
            href="/refer"
            className="text-xs font-semibold text-medical-600 hover:text-medical-800 transition shrink-0"
          >
            Write a referral →
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-16">
        <ReferralTracker initialCode={code} />
      </main>
    </div>
  );
}
