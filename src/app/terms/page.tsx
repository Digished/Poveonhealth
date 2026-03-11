import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PoveonLogo } from "@/components/PoveonLogo";

export const metadata = {
  title: "Terms & Conditions — Poveon",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      <nav className="border-b border-white/80 bg-white/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <PoveonLogo className="w-8 h-8" />
            <span className="font-bold text-medical-700 text-lg">Poveon</span>
          </Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-12 pb-24">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="bg-white/80 backdrop-blur-md border border-white/50 rounded-3xl shadow-sm p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Terms &amp; Conditions</h1>
            <p className="text-sm text-slate-400 mt-1">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>

          <Section title="1. Acceptance of Terms">
            By accessing and using the Poveon platform, you accept and agree to be bound by these Terms and Conditions. If you do not agree to these terms, you must not use this platform.
          </Section>

          <Section title="2. Authorisation">
            By submitting a laboratory test request through Poveon, you confirm that you are a licensed healthcare professional authorised to request diagnostic tests on behalf of the patient named in the request. You also confirm that you are authorised to receive and act upon the results of those tests.
          </Section>

          <Section title="3. Accuracy of Information">
            You are solely responsible for the accuracy and completeness of all information submitted, including patient details, clinical indications, and test selections. Poveon does not verify the accuracy of the information you provide.
          </Section>

          <Section title="4. Use of the Platform">
            The Poveon platform may only be used for legitimate medical purposes. Any fraudulent, abusive, or unlawful use of the platform is strictly prohibited and may result in legal action.
          </Section>

          <Section title="5. Laboratory Relationships">
            Poveon acts as a communication intermediary between healthcare professionals and laboratories. Poveon is not responsible for the clinical decisions, turnaround times, or quality of services provided by any listed laboratory.
          </Section>

          <Section title="6. Intellectual Property">
            All content, trademarks, and data on this platform are the property of Poveon or its licensors. You may not reproduce, distribute, or create derivative works without prior written consent.
          </Section>

          <Section title="7. Limitation of Liability">
            To the maximum extent permitted by law, Poveon shall not be liable for any indirect, incidental, or consequential damages arising from the use or inability to use the platform.
          </Section>

          <Section title="8. Changes to Terms">
            We reserve the right to modify these terms at any time. Continued use of the platform after changes are posted constitutes acceptance of the revised terms.
          </Section>

          <Section title="9. Contact">
            For questions regarding these Terms &amp; Conditions, please contact us at <a href="mailto:legal@poveon.com" className="text-medical-600 hover:underline">legal@poveon.com</a>.
          </Section>
        </div>
      </main>

      <footer className="border-t border-white/60 bg-white/40 backdrop-blur-sm py-6">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Poveon. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="hover:text-slate-600 transition-colors">Terms &amp; Conditions</Link>
            <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold text-slate-700">{title}</h2>
      <p className="text-sm text-slate-500 leading-relaxed">{children}</p>
    </div>
  );
}
