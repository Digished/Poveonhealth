"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Building2, FlaskConical, Pill, Stethoscope, User } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { PageLoader } from "@/components/PageLoader";
import { LAST_PORTAL_KEY, rememberPortal, type PortalKey } from "@/lib/portal-preference";

const PORTALS: {
  key: PortalKey;
  href: string;
  icon: typeof User;
  title: string;
  blurb: string;
  tone: string;
}[] = [
  {
    key: "patient",
    href: "/login",
    icon: User,
    title: "I'm a patient",
    blurb: "My results, my care plan, my prescriptions.",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    key: "doctor",
    href: "/doc-login",
    icon: Stethoscope,
    title: "I'm a medical professional",
    blurb: "Referrals, care-plan members and earnings.",
    tone: "border-medical-200 bg-medical-50 text-medical-700",
  },
];

/**
 * The installed app opens here.
 *
 * A returning user goes straight to whichever portal they last used — that
 * choice is stable for almost everyone, and re-asking every launch would be
 * the wrong default. `?as=` overrides it (so a link from the doctor pages
 * lands on the right side), and switching is always one tap away.
 */
function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [remembered, setRemembered] = useState<PortalKey | null>(null);
  const [ready, setReady] = useState(false);

  const asParam = params.get("as");
  const requested: PortalKey | null =
    asParam === "patient" || asParam === "doctor" ? asParam : null;

  useEffect(() => {
    // An explicit ?as= wins and is remembered for next time.
    if (requested) {
      rememberPortal(requested);
      router.replace(requested === "doctor" ? "/doc-login" : "/login");
      return;
    }

    let last: PortalKey | null = null;
    try {
      const stored = localStorage.getItem(LAST_PORTAL_KEY);
      if (stored === "patient" || stored === "doctor") last = stored;
    } catch { /* private mode — just show the choice */ }

    if (last && params.get("choose") !== "1") {
      router.replace(last === "doctor" ? "/doc-login" : "/login");
      return;
    }

    setRemembered(last);
    setReady(true);
  }, [requested, params, router]);

  if (!ready) return <PageLoader label="Opening Poveon…" />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-sky-50 via-white to-emerald-50/60 px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <PoveonLogo className="h-7 w-7 text-medical-600" />
          <span className="text-xl font-bold text-slate-900">Poveon</span>
        </Link>

        <h1 className="text-center text-xl font-bold text-slate-900">How will you be using Poveon?</h1>
        <p className="mt-1.5 text-center text-sm text-slate-500">
          We&apos;ll remember, so you only pick once.
        </p>

        <div className="mt-7 space-y-3">
          {PORTALS.map((p) => {
            const Icon = p.icon;
            const isLast = remembered === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  rememberPortal(p.key);
                  router.push(p.href);
                }}
                className={`group flex w-full items-center gap-4 rounded-2xl border-2 bg-white p-4 text-left transition hover:shadow-lg ${
                  isLast ? "border-medical-400 shadow-md" : "border-slate-200 hover:border-medical-300"
                }`}
              >
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${p.tone}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-900">{p.title}</span>
                    {isLast && (
                      <span className="rounded-full bg-medical-50 px-2 py-0.5 text-[10px] font-bold text-medical-700">
                        Last used
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-500">{p.blurb}</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-medical-500" />
              </button>
            );
          })}
        </div>

        <div className="mt-8">
          <p className="text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Other portals
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <OtherPortal href="/lab-login" icon={FlaskConical} label="Laboratory" />
            <OtherPortal href="/hospital-login" icon={Building2} label="Hospital" />
            <OtherPortal href="/pharmacy-login" icon={Pill} label="Pharmacy" />
          </div>
        </div>
      </div>
    </div>
  );
}

function OtherPortal({ href, icon: Icon, label }: { href: string; icon: typeof User; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-3 text-center transition hover:border-slate-300"
    >
      <Icon className="h-4 w-4 text-slate-400" />
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
    </Link>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SignInInner />
    </Suspense>
  );
}
