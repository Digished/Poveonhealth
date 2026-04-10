import { ArrowLeft, Mail, Phone, MapPin } from "lucide-react";
import Link from "next/link";
import { PoveonLogo } from "@/components/PoveonLogo";

export const metadata = {
  title: "Contact Poveon - Get in Touch",
  description: "Have a question? We'd love to hear from you. Contact Poveon today.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/home" className="flex items-center gap-2 text-slate-600 hover:text-slate-900">
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
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 mb-6">
            Get in Touch
          </h1>
          <p className="text-xl text-slate-600">
            Have a question? We're here to help. Reach out to us anytime.
          </p>
        </div>
      </section>

      {/* Contact Info */}
      <section className="py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {[
              {
                icon: Mail,
                title: "Email",
                value: "hello@poveon.com",
                href: "mailto:hello@poveon.com",
              },
              {
                icon: Phone,
                title: "Phone",
                value: "+234 (0) 800 POVEON",
                href: "tel:+2348007686366",
              },
              {
                icon: MapPin,
                title: "Address",
                value: "Lagos, Nigeria",
                href: "#",
              },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="text-center">
                  <Icon className="w-10 h-10 text-medical-600 mx-auto mb-4" />
                  <h3 className="font-bold text-slate-900 mb-2">{item.title}</h3>
                  {item.href !== "#" ? (
                    <a
                      href={item.href}
                      className="text-slate-600 hover:text-medical-600 transition"
                    >
                      {item.value}
                    </a>
                  ) : (
                    <p className="text-slate-600">{item.value}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Contact Form */}
          <div className="max-w-2xl mx-auto bg-slate-50 rounded-2xl p-8 border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">Send us a Message</h2>
            <form className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-500"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-500"
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-500"
                  placeholder="How can we help?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Message
                </label>
                <textarea
                  rows={6}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-500"
                  placeholder="Tell us more..."
                ></textarea>
              </div>

              <button
                type="submit"
                className="w-full px-6 py-3 rounded-xl bg-medical-600 text-white font-bold hover:bg-medical-700 transition"
              >
                Send Message
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-24 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-12">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {[
              {
                q: "How long does it take to get results?",
                a: "Most tests are completed within 24 hours. Some urgent tests can be processed faster. You'll receive updates via SMS and email.",
              },
              {
                q: "Which labs are available?",
                a: "We partner with 50+ certified laboratories across Nigeria. You can choose the lab nearest to you when creating a request.",
              },
              {
                q: "Is my data secure?",
                a: "Yes. We use enterprise-grade encryption and comply with all healthcare data protection regulations.",
              },
              {
                q: "Can I request tests on behalf of my patient?",
                a: "Yes. Doctors can submit requests on behalf of their patients, or patients can submit requests themselves.",
              },
            ].map((item, idx) => (
              <div key={idx} className="bg-white rounded-xl p-6 border border-slate-200">
                <h3 className="font-bold text-slate-900 mb-2">{item.q}</h3>
                <p className="text-slate-600">{item.a}</p>
              </div>
            ))}
          </div>
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
                <li><Link href="/home" className="hover:text-white transition">Home</Link></li>
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
