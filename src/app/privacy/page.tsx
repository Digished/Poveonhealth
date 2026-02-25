import { FlaskConical, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Poveon",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      <nav className="border-b border-white/80 bg-white/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-medical-600 rounded-xl flex items-center justify-center">
              <FlaskConical className="w-[18px] h-[18px] text-white" />
            </div>
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
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-slate-400 mt-1">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>

          <Section title="1. Overview">
            Poveon is committed to protecting the privacy of all individuals who use our platform. This policy explains what data we collect, how we use it, and the choices you have.
          </Section>

          <Section title="2. Data We Collect">
            When a request is submitted, we collect the following information: patient name, date of birth, sex, contact details, residential address, clinical diagnosis, and requested tests. We also collect the submitting healthcare professional's name, title, contact details, and bank information for result routing.
          </Section>

          <Section title="3. How We Use Your Data">
            The information collected is used solely to facilitate the processing of laboratory test requests. Specifically, it is transmitted to the designated laboratory for order fulfilment and used to send email notifications to both the requesting professional and the laboratory.
          </Section>

          <Section title="4. Data Sharing">
            We share patient and request data only with the laboratory selected by the submitting healthcare professional. We do not sell, trade, or rent personal information to third parties. We may disclose data if required by law or a lawful authority.
          </Section>

          <Section title="5. Data Retention">
            Request data is retained for a period necessary to fulfil the request and comply with applicable healthcare record-keeping obligations. You may request deletion of your data by contacting us directly.
          </Section>

          <Section title="6. Security">
            All data transmitted through Poveon is encrypted using TLS. We apply industry-standard security measures to protect data at rest and in transit. However, no method of transmission over the internet is 100% secure.
          </Section>

          <Section title="7. Your Rights">
            You have the right to access, correct, or request deletion of personal data we hold about you. To exercise these rights, please contact us at <a href="mailto:privacy@poveon.com" className="text-medical-600 hover:underline">privacy@poveon.com</a>.
          </Section>

          <Section title="8. Cookies">
            Poveon does not use tracking or advertising cookies. We may use essential session cookies to maintain form state across page interactions.
          </Section>

          <Section title="9. Changes to This Policy">
            We may update this Privacy Policy from time to time. We will notify users of material changes by updating the date at the top of this page.
          </Section>

          <Section title="10. Contact">
            For privacy-related enquiries, contact us at <a href="mailto:privacy@poveon.com" className="text-medical-600 hover:underline">privacy@poveon.com</a>.
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
