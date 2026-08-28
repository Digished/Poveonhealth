import { ArrowLeft, Shield, Lock, Eye, AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { PoveonLogo } from "@/components/PoveonLogo";

export const metadata = {
  title: "Security - Poveon Health",
  description: "Learn how Poveon protects your medical data with enterprise-grade security.",
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </Link>
          <div className="flex items-center gap-2 ml-auto">
            <PoveonLogo className="w-6 h-6" />
            <span className="font-bold text-lg text-slate-900">Poveon</span>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-16 sm:py-24 bg-gradient-to-b from-medical-50 to-white">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6">
            Your Security is Our Priority
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            We implement industry-leading security practices to protect your medical data. Your privacy and safety are at the core of everything we do.
          </p>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-12">Security Features</h2>
          <div className="space-y-6">
            {[
              {
                icon: Lock,
                title: "End-to-End Encryption",
                description:
                  "All data in transit is encrypted using TLS 1.3. Medical records are encrypted at rest using AES-256.",
              },
              {
                icon: Shield,
                title: "Compliance & Certifications",
                description:
                  "We comply with HIPAA, GDPR, and Nigeria's NDPR regulations to ensure your data meets international standards.",
              },
              {
                icon: Eye,
                title: "Access Control",
                description:
                  "Strict role-based access controls ensure only authorized personnel can access your medical information.",
              },
              {
                icon: AlertCircle,
                title: "Regular Audits",
                description:
                  "We conduct regular security audits and penetration testing to identify and fix vulnerabilities.",
              },
              {
                icon: CheckCircle2,
                title: "Data Integrity",
                description:
                  "We maintain backups and use checksums to ensure your data is never corrupted or lost.",
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div key={idx} className="flex gap-6 bg-slate-50 rounded-2xl p-6 border border-slate-200">
                  <Icon className="w-10 h-10 text-medical-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>
                    <p className="text-slate-600">{feature.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Data Protection */}
      <section className="py-16 sm:py-24 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-8">Data Protection</h2>
          <div className="bg-white rounded-2xl p-8 border border-slate-200 space-y-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Collection & Storage</h3>
              <p className="text-slate-600">
                We collect only the information necessary to process your lab request. All data is stored on secure, certified servers with redundant backups.
              </p>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Sharing & Third Parties</h3>
              <p className="text-slate-600">
                We never sell your data. We only share medical information with partner laboratories to fulfill your request, and only with your explicit consent.
              </p>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Your Rights</h3>
              <p className="text-slate-600">
                You have the right to access, correct, or delete your data at any time. Contact us to exercise these rights.
              </p>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Retention Policy</h3>
              <p className="text-slate-600">
                We retain your data for as long as necessary to provide our services and comply with legal obligations. You can request deletion anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Incident Response */}
      <section className="py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-8">Incident Response</h2>
          <div className="bg-medical-50 rounded-2xl p-8 border border-medical-200">
            <p className="text-slate-700 mb-4">
              In the unlikely event of a security incident, we have a robust incident response plan. We will:
            </p>
            <ul className="space-y-3 text-slate-700">
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-medical-600 flex-shrink-0 mt-0.5" />
                <span>Immediately contain the breach and assess impact</span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-medical-600 flex-shrink-0 mt-0.5" />
                <span>Notify affected users within 48 hours</span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-medical-600 flex-shrink-0 mt-0.5" />
                <span>Work with authorities if required</span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-medical-600 flex-shrink-0 mt-0.5" />
                <span>Provide free credit monitoring if personal data is compromised</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Contact Security Team */}
      <section className="py-16 sm:py-24 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Report a Security Issue</h2>
          <p className="text-lg text-slate-600 mb-8">
            Found a vulnerability? Please report it responsibly to our security team.
          </p>
          <a
            href="mailto:security@poveon.com"
            className="inline-block px-8 py-3 rounded-xl bg-medical-600 text-white font-bold hover:bg-medical-700 transition"
          >
            security@poveon.com
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <PoveonLogo className="w-5 h-5" />
                <span className="font-bold text-white">Poveon</span>
              </div>
              <p className="text-sm">Lab testing simplified for everyone.</p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/" className="hover:text-white transition">Home</Link></li>
                <li><Link href="/about" className="hover:text-white transition">About</Link></li>
                <li><Link href="/contact" className="hover:text-white transition">Contact</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy" className="hover:text-white transition">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition">Terms</Link></li>
                <li><Link href="/security" className="hover:text-white transition">Security</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8">
            <p className="text-sm">© 2025 Poveon Health. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
