import { ArrowLeft, Heart, Users, Zap, Shield } from "lucide-react";
import Link from "next/link";
import { PoveonLogo } from "@/components/PoveonLogo";

export const metadata = {
  title: "About Poveon - Our Mission",
  description: "Learn about Poveon's mission to simplify laboratory testing for everyone.",
};

export default function AboutPage() {
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
            Our Mission: Testing Made Simple
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            At Poveon, we believe that access to reliable laboratory testing should be simple, fast, and accessible to everyone. We're building the future of healthcare by removing barriers between patients, doctors, and quality lab services.
          </p>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-12">Our Values</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: Heart,
                title: "Patient-First",
                description: "Everything we do is centered on making healthcare better for patients and doctors.",
              },
              {
                icon: Zap,
                title: "Speed & Efficiency",
                description: "We eliminate unnecessary delays. From request to results, we keep things moving.",
              },
              {
                icon: Shield,
                title: "Trust & Security",
                description: "Your medical data is sacred. We protect it with enterprise-grade security.",
              },
              {
                icon: Users,
                title: "Community-Driven",
                description: "We work closely with labs, doctors, and patients to continuously improve.",
              },
            ].map((value, idx) => {
              const Icon = value.icon;
              return (
                <div key={idx} className="bg-slate-50 rounded-2xl p-8 border border-slate-200">
                  <Icon className="w-10 h-10 text-medical-600 mb-4" />
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{value.title}</h3>
                  <p className="text-slate-600">{value.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 sm:py-24 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-8">Our Story</h2>
          <div className="prose prose-lg max-w-none text-slate-600 space-y-6">
            <p>
              Poveon was founded with a simple observation: getting lab tests shouldn't be complicated. Patients had to visit multiple places, doctors wasted time on paperwork, and labs struggled with manual processes.
            </p>
            <p>
              We saw an opportunity to build a platform that connects everyone in the healthcare ecosystem, making laboratory testing faster, simpler, and more reliable.
            </p>
            <p>
              Today, Poveon partners with leading laboratories across Africa to provide seamless lab testing services. We're proud to have helped thousands of patients and doctors access the testing they need.
            </p>
            <p>
              Our vision is clear: become the most trusted laboratory testing platform, making quality healthcare accessible to everyone.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 bg-medical-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Join Us</h2>
          <p className="text-lg text-medical-100 mb-8">
            Whether you're a patient, doctor, or lab partner, we'd love to hear from you.
          </p>
          <Link
            href="/contact"
            className="inline-block px-8 py-3 rounded-xl bg-white text-medical-600 font-bold hover:bg-slate-50 transition"
          >
            Get in Touch
          </Link>
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
