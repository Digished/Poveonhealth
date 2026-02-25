import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Top navigation bar */}
      <nav className="border-b border-white/80 bg-white/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PoveonLogo className="w-8 h-8" />
            <span className="font-bold text-medical-700 text-lg">Poveon</span>
          </div>
          <div className="flex items-center gap-2 text-sm" />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 pb-20">
        <DoctorRequestForm />
        <TrustIndicators />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/60 bg-white/40 backdrop-blur-sm py-6">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Poveon. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <a href="/terms" className="hover:text-slate-600 transition-colors">Terms &amp; Conditions</a>
            <a href="/privacy" className="hover:text-slate-600 transition-colors">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
