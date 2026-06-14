import Link from "next/link";
import { PoveonLogo } from "@/components/PoveonLogo";
import { SkinConsultFlow } from "@/components/skin/SkinConsultFlow";

export const metadata = {
  title: "Ask a Dermatologist — Poveon Health",
  description:
    "Upload photos of your skin concern, answer a few quick questions, and a dermatologist will review and reach out to you on WhatsApp. Simple, private, async skin consultations.",
};

export default function SkinPage() {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-rose-50 via-sky-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/60 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <PoveonLogo className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 leading-tight truncate">Ask a Dermatologist</p>
              <p className="text-[11px] text-slate-400 leading-tight">Poveon Skin Clinic</p>
            </div>
          </Link>
          <span className="text-[11px] font-medium text-slate-400 shrink-0">Private &amp; secure</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4">
        <SkinConsultFlow />
      </main>
    </div>
  );
}
