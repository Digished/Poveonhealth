import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";
import { Navbar } from "@/components/Navbar";

export default function HomePage() {
  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 overflow-hidden">
      <Navbar />
      {/* Scrollable content area — page never scrolls, only this div does */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto px-4 pb-2">
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
          <PoveonLogo className="w-5 h-5 opacity-40" />
          <span>© {new Date().getFullYear()} Poveon.</span>
          <a href="/terms" className="hover:text-slate-600 transition-colors">Terms</a>
          <a href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</a>
          <a href="/api-docs" className="hover:text-slate-600 transition-colors">API Docs</a>
        </div>
      </main>
    </div>
  );
}
