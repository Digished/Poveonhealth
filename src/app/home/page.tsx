import { ArrowRight, Check, Zap, Users, BarChart3, Shield, FlaskConical, MessageCircle } from "lucide-react";
import Link from "next/link";
import { PoveonLogo } from "@/components/PoveonLogo";

export const metadata = {
  title: "Poveon Health - Laboratory Tests Made Simple",
  description: "Fast, reliable laboratory tests for doctors and patients. Request tests online, get results quickly.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PoveonLogo className="w-6 h-6" />
            <span className="font-bold text-lg text-slate-900">Poveon</span>
          </div>
          <div className="hidden sm:flex items-center gap-8">
            <a href="#features" className="text-sm text-slate-600 hover:text-slate-900 transition">Features</a>
            <a href="#how-it-works" className="text-sm text-slate-600 hover:text-slate-900 transition">How it Works</a>
            <a href="#contact" className="text-sm text-slate-600 hover:text-slate-900 transition">Contact</a>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-medical-600 text-white font-semibold text-sm hover:bg-medical-700 transition"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 sm:py-32 overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-medical-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-emerald-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        </div>

        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left side - Content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight">
                  Laboratory Tests Made <span className="text-medical-600">Simple</span>
                </h1>
                <p className="text-lg text-slate-600 leading-relaxed">
                  Request lab tests online for your patients. Get accurate results fast. Built for doctors and patients who demand reliability.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-medical-600 text-white font-semibold hover:bg-medical-700 transition shadow-lg shadow-medical-600/30"
                >
                  Start Now
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition"
                >
                  <MessageCircle className="w-5 h-5" />
                  Learn More
                </a>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 pt-8">
                <div>
                  <p className="text-2xl font-bold text-medical-600">50+</p>
                  <p className="text-sm text-slate-600">Partner Labs</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-medical-600">10K+</p>
                  <p className="text-sm text-slate-600">Tests Monthly</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-medical-600">24h</p>
                  <p className="text-sm text-slate-600">Avg Results</p>
                </div>
              </div>
            </div>

            {/* Right side - Visual */}
            <div className="relative hidden md:block">
              <div className="absolute inset-0 bg-gradient-to-br from-medical-50 to-emerald-50 rounded-3xl"></div>
              <div className="relative p-8 space-y-6">
                <div className="bg-white rounded-2xl p-6 shadow-xl border border-slate-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-medical-100 flex items-center justify-center">
                      <FlaskConical className="w-5 h-5 text-medical-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Quick Request</p>
                      <p className="text-xs text-slate-500">Select tests in seconds</p>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full w-3/4 bg-medical-500 rounded-full"></div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-xl border border-slate-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Instant Confirmation</p>
                      <p className="text-xs text-slate-500">Get your request code immediately</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-xl border border-slate-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Track Results</p>
                      <p className="text-xs text-slate-500">View results in your portal</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 sm:py-32 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">How It Works</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Three simple steps to request lab tests and get results
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                number: "1",
                title: "Select Your Lab",
                description: "Choose from 50+ partner laboratories near you or request from your preferred lab.",
                icon: Building2,
              },
              {
                number: "2",
                title: "Choose Tests",
                description: "Browse our catalog of tests or use our Health Assistant to find what you need.",
                icon: FlaskConical,
              },
              {
                number: "3",
                title: "Get Results",
                description: "Receive your request code instantly. Visit the lab and check results online.",
                icon: BarChart3,
              },
            ].map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={idx} className="relative">
                  <div className="bg-white rounded-2xl p-8 h-full border border-slate-200 hover:border-medical-200 transition">
                    <div className="absolute -top-5 left-8">
                      <div className="w-10 h-10 rounded-full bg-medical-600 text-white flex items-center justify-center font-bold text-lg">
                        {step.number}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mb-4 pt-2">
                      <Icon className="w-8 h-8 text-medical-600 flex-shrink-0" />
                      <h3 className="text-lg font-bold text-slate-900">{step.title}</h3>
                    </div>

                    <p className="text-slate-600">{step.description}</p>
                  </div>

                  {idx < 2 && (
                    <div className="hidden md:flex absolute top-1/2 -right-4 transform -translate-y-1/2">
                      <ArrowRight className="w-6 h-6 text-slate-300" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 sm:py-32">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Why Choose Poveon?</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Everything you need for reliable laboratory testing
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                icon: Zap,
                title: "Lightning Fast",
                description: "Request tests in minutes. No waiting, no paperwork.",
              },
              {
                icon: Shield,
                title: "Secure & Private",
                description: "Your medical data is encrypted and protected.",
              },
              {
                icon: Users,
                title: "For Everyone",
                description: "Doctors, patients, and healthcare providers welcome.",
              },
              {
                icon: Check,
                title: "Quality Assured",
                description: "Partner with only the best certified laboratories.",
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div key={idx} className="flex gap-6">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-medical-100">
                      <Icon className="h-6 w-6 text-medical-600" />
                    </div>
                  </div>
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

      {/* CTA Section */}
      <section className="py-20 sm:py-32 bg-gradient-to-r from-medical-600 to-medical-700">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Simplify Lab Testing?
          </h2>
          <p className="text-lg text-medical-100 mb-8 max-w-2xl mx-auto">
            Join thousands of doctors and patients who trust Poveon for accurate, fast lab results.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-medical-600 font-bold text-lg hover:bg-slate-50 transition shadow-xl"
          >
            Get Started Now
            <ArrowRight className="w-6 h-6" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
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
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition">How It Works</a></li>
                <li><a href="/" className="hover:text-white transition">Get Started</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/about" className="hover:text-white transition">About</a></li>
                <li><a href="/contact" className="hover:text-white transition">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/privacy" className="hover:text-white transition">Privacy</a></li>
                <li><a href="/terms" className="hover:text-white transition">Terms</a></li>
                <li><a href="/security" className="hover:text-white transition">Security</a></li>
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

// Building2 icon (not imported)
function Building2(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 5 7 13 17 13 17 5"></polyline>
    </svg>
  );
}
