import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";

export default function HomePage() {
  return (
    <div className="relative h-dvh flex flex-col bg-white overflow-hidden">
      {/* Mesh background — CSS gradients only, no filter blur */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 50% at 25% 0%, rgba(224,242,254,0.7) 0%, transparent 70%), " +
            "radial-gradient(ellipse 60% 45% at 90% 30%, rgba(224,231,255,0.5) 0%, transparent 65%), " +
            "radial-gradient(ellipse 55% 50% at 5% 90%, rgba(240,253,244,0.6) 0%, transparent 65%)",
        }}
      />

      <Navbar />

      {/* Scrollable content area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden snap-y snap-mandatory">
        <div className="max-w-2xl mx-auto snap-start snap-always">
          <HeroSection />
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-2 snap-start snap-always">
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
