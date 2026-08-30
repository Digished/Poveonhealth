"use client";

/**
 * "Install the app" — quiet, permanent, and in the dashboard rather than over it.
 *
 * The pop-up offer is dismissable and, once dismissed, gone for good; anyone who
 * decides later has no way back. This is the way back: a small button that sits
 * in the dashboard header and simply is not rendered when the browser has
 * nothing to install (already installed, or an unsupported browser).
 */

import { useEffect, useState } from "react";
import { Download, Plus, Share, X } from "lucide-react";
import {
  getInstallEvent,
  isIosSafari,
  isStandalone,
  onInstallEvent,
  runInstall,
} from "@/lib/install-prompt";

export function InstallButton({ className = "" }: { className?: string }) {
  const [available, setAvailable] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIos, setShowIos] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    setAvailable(!!getInstallEvent());
    setIos(isIosSafari());
    return onInstallEvent((e) => setAvailable(!!e));
  }, []);

  if (!available && !ios) return null;

  async function install() {
    if (ios && !available) {
      setShowIos(true);
      return;
    }
    setBusy(true);
    try {
      await runInstall();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={install}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-medical-300 hover:text-medical-600 disabled:opacity-60 ${className}`}
        title="Install Poveon on this device"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{busy ? "Installing…" : "Install app"}</span>
      </button>

      {showIos && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-slate-800">Add Poveon to your home screen</p>
            <button
              onClick={() => setShowIos(false)}
              className="shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-slate-500">
            Tap <Share className="inline h-3.5 w-3.5 text-slate-400" /> at the bottom of Safari, then
            <span className="inline-flex items-center gap-0.5 font-semibold text-slate-700">
              <Plus className="h-3 w-3" />
              Add to Home Screen
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
