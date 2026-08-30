"use client";

import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";
import {
  getInstallEvent,
  isIosSafari,
  isStandalone,
  onInstallEvent,
  runInstall,
  type InstallEvent,
} from "@/lib/install-prompt";

const DISMISS_KEY = "poveon_install_dismissed";

/**
 * Registers the service worker and offers "add to home screen".
 *
 * Chrome hands us a real install event we can trigger. iOS Safari has no such
 * API, so there we show the manual instructions instead — and only to iPhone
 * users who aren't already running the installed app.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Registration failing just means no offline shell — not an error worth showing. */
      });
    }

    if (isStandalone()) return;

    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* private mode */ }
    if (dismissed) return;

    // The event may already have fired before this mounted — lib/install-prompt
    // has been listening since it was imported, so ask it rather than the window.
    setDeferred(getInstallEvent());
    // iOS never fires that event, so detect it and explain the manual steps.
    if (isIosSafari()) setShowIosHint(true);

    return onInstallEvent(setDeferred);
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    setDeferred(null);
    setShowIosHint(false);
  }

  async function install() {
    if (!deferred || installing) return;
    setInstalling(true);
    try {
      await runInstall();
    } finally {
      setInstalling(false);
      dismiss();
    }
  }

  if (!deferred && !showIosHint) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[280] mx-auto max-w-md sm:inset-x-auto sm:right-4 sm:bottom-4">
      <div className="animate-slide-up flex items-start gap-3 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-medical-50 text-medical-600">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800">Install Poveon</p>
          {deferred ? (
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Add it to your home screen — patients and medical professionals both sign in from it.
            </p>
          ) : (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-slate-500">
              Tap <Share className="inline h-3.5 w-3.5 text-slate-400" /> then
              <span className="inline-flex items-center gap-0.5 font-semibold text-slate-700">
                <Plus className="h-3 w-3" />Add to Home Screen
              </span>
            </p>
          )}
          {deferred && (
            <button
              onClick={install}
              disabled={installing}
              className="mt-2.5 rounded-xl bg-medical-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-medical-700 disabled:opacity-50"
            >
              {installing ? "Installing…" : "Add to home screen"}
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
