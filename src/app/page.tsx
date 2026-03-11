import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";

export default function HomePage() {
  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 overflow-hidden">
      {/* Top navigation bar */}
      <nav className="border-b border-white/80 bg-white/60 backdrop-blur-md shrink-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PoveonLogo className="w-8 h-8" />
            <span className="font-bold text-medical-700 text-lg">Poveon</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <a href="/api-docs" className="text-slate-500 hover:text-medical-700 transition-colors">
              API Docs
            </a>
          </div>
        </div>
      </nav>

      {/* Scrollable content area — page never scrolls, only this div does */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 pt-2 pb-2">
          <DoctorRequestForm />
        </div>

        {/* Full-width trust indicators strip */}
        <div className="w-full border-t border-white/60 bg-white/30 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <TrustIndicators />
          </div>
        </div>

        {/* Compact inline footer */}
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-4 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Poveon.</span>
          <a href="/terms" className="hover:text-slate-600 transition-colors">Terms</a>
          <a href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</a>
        </div>
      </main>
    </div>
  );
}
