import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";

export default function HomePage() {
  return (
    <div className="relative h-dvh flex flex-col bg-white overflow-hidden">
      {/* Subtle mesh-gradient background — soft colour orbs, always behind content */}
      <div className="absolute inset-0 -z-10 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-20 left-1/4 w-[480px] h-[480px] bg-sky-100/70 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[380px] h-[380px] bg-indigo-100/50 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-16 w-[340px] h-[340px] bg-medical-50/60 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-[280px] h-[280px] bg-sky-50/60 rounded-full blur-3xl" />
      </div>

      <Navbar />

      {/* Scrollable content area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden snap-y snap-proximity">
        <div className="max-w-2xl mx-auto snap-start">
          <HeroSection />
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-2 snap-start">
          <DoctorRequestForm />
        </div>

        {/* Trust indicators strip */}
        <div className="w-full border-t border-white/60 bg-white/30 backdrop-blur-sm mt-4">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <TrustIndicators />
          </div>
        </div>

        {/* Compact footer */}
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
