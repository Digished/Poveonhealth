import Link from "next/link";
import { Home, FlaskConical, Stethoscope, Search } from "lucide-react";

const SUGGESTIONS = [
  { href: "/", label: "Home", icon: Home, desc: "Back to the main page" },
  { href: "/doc-login", label: "Doctor Login", icon: Stethoscope, desc: "Log in as a medical professional" },
  { href: "/lab-login", label: "Lab Login", icon: FlaskConical, desc: "Log in as a laboratory" },
];

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center px-4 py-16">
      {/* Big 404 */}
      <div className="relative mb-8">
        <p className="text-[120px] sm:text-[160px] font-black text-slate-100 leading-none select-none">
          404
        </p>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-medical-500 to-sky-500 flex items-center justify-center shadow-xl shadow-medical-500/30">
            <Search className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
        </div>
      </div>

      {/* Message */}
      <div className="text-center max-w-md mb-10">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-3">
          Page not found
        </h1>
        <p className="text-slate-500 text-sm sm:text-base leading-relaxed">
          We couldn&apos;t find what you were looking for. The page may have moved, been deleted, or the link might be misspelled.
        </p>
      </div>

      {/* Did you mean? */}
      <div className="w-full max-w-sm space-y-3 mb-8">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">
          Did you mean?
        </p>
        {SUGGESTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center gap-3 px-4 py-3.5 bg-white border border-slate-200 rounded-2xl hover:border-medical-300 hover:shadow-md hover:shadow-medical-100 transition-all group"
          >
            <div className="w-9 h-9 rounded-xl bg-medical-50 border border-medical-100 flex items-center justify-center shrink-0 group-hover:bg-medical-100 transition-colors">
              <s.icon className="w-4.5 h-4.5 text-medical-600 w-[18px] h-[18px]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 group-hover:text-medical-700 transition-colors">{s.label}</p>
              <p className="text-xs text-slate-500">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Go home button */}
      <Link
        href="/"
        className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-2xl transition-colors shadow-lg"
      >
        <Home className="w-4 h-4" />
        Take me home
      </Link>

      <p className="mt-8 text-xs text-slate-400">
        If you think this is a bug, please{" "}
        <a href="mailto:support@poveon.com" className="underline hover:text-slate-600 transition-colors">
          contact support
        </a>
        .
      </p>
    </div>
  );
}
