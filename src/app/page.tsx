import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { FlaskConical, Shield, Clock, Mail } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Top navigation bar */}
      <nav className="border-b border-white/80 bg-white/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-medical-600 rounded-xl flex items-center justify-center">
              <FlaskConical className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" />
            </div>
            <span className="font-bold text-medical-700 text-lg">Poveon</span>
          </div>
          <div className="flex items-center gap-2 text-sm" />
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-10 pb-20">
        <DoctorRequestForm />

        {/* Trust indicators */}
        <div className="mt-12 grid grid-cols-3 gap-4">
          {[
            {
              icon: <Shield className="w-5 h-5 text-medical-600" />,
              title: "Secure",
              desc: "End-to-end encrypted requests",
            },
            {
              icon: <Clock className="w-5 h-5 text-medical-600" />,
              title: "Instant",
              desc: "Real-time lab notifications",
            },
            {
              icon: <Mail className="w-5 h-5 text-medical-600" />,
              title: "Notified",
              desc: "Email updates at every step",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="text-center p-4 bg-white/60 rounded-2xl border border-white/80"
            >
              <div className="flex justify-center mb-2">{item.icon}</div>
              <p className="text-xs font-semibold text-slate-700">{item.title}</p>
              <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/60 bg-white/40 backdrop-blur-sm py-6">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Poveon Health. All rights reserved.</span>
          <span>Secure lab request platform</span>
        </div>
      </footer>
    </div>
  );
}
