import Link from "next/link";
import { CloudOff } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";

export const metadata = { title: "Offline — Poveon" };

/** Served by the service worker when a navigation fails with no network. */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-sky-50 via-white to-emerald-50/60 px-6 text-center">
      <div className="flex items-center gap-2">
        <PoveonLogo className="h-6 w-6 text-medical-600" />
        <span className="text-lg font-bold text-slate-900">Poveon</span>
      </div>
      <div className="mt-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
        <CloudOff className="h-7 w-7 text-slate-300" />
      </div>
      <h1 className="mt-4 text-lg font-bold text-slate-800">You&apos;re offline</h1>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Your care code works without a connection — it&apos;s the one on your card. Everything else
        needs the internet.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-xl bg-medical-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-medical-700"
      >
        Try again
      </Link>
    </div>
  );
}
