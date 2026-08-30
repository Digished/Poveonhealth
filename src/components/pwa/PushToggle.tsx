"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Bell, BellOff, Loader2 } from "lucide-react";

/**
 * Turning notifications on for this device.
 *
 * Asking for permission unprompted is how people say no forever, so this is a
 * button they press — and it is only offered where it makes sense: once the app
 * is installed, or in the browser if they want it there.
 *
 * Registration is per device, not per account. Someone with a phone and a
 * laptop turns it on twice, which is correct: they are separate devices and
 * either can be revoked.
 */

/** The base64url VAPID key has to reach the browser as raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "unsupported" | "unavailable" | "off" | "on" | "blocked";

export function PushToggle({ className = "" }: { className?: string }) {
  const [state, setState] = useState<State>("off");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }

    try {
      const res = await fetch("/api/push/subscribe", { cache: "no-store" });
      const d = await res.json();
      if (!d.available || !d.public_key) { setState("unavailable"); return; }
      setPublicKey(d.public_key);
    } catch {
      setState("unavailable");
      return;
    }

    if (Notification.permission === "denied") { setState("blocked"); return; }

    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const existing = await reg?.pushManager.getSubscription().catch(() => null);
    setState(existing ? "on" : "off");
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function enable() {
    if (busy || !publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        // Leaving a browser subscription the server does not know about would
        // look enabled and never deliver anything.
        await sub.unsubscribe().catch(() => {});
        toast.error(d?.error ?? "Could not turn notifications on.");
        return;
      }
      setState("on");
      toast.success("Notifications on for this device");
    } catch {
      toast.error("Could not turn notifications on.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
      toast.success("Notifications off for this device");
    } finally {
      setBusy(false);
    }
  }

  // Nothing to offer, and saying so would only be noise.
  if (state === "unsupported" || state === "unavailable") return null;

  return (
    <div className={`rounded-2xl border border-slate-100 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            state === "on" ? "bg-medical-50 text-medical-600" : "bg-slate-100 text-slate-400"
          }`}
        >
          {state === "on" ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">Notifications on this device</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {state === "blocked"
              ? "Your browser is blocking notifications for Poveon. Turn them back on in your browser's site settings, then reload."
              : state === "on"
                ? "You'll be told here when a new message arrives, even with the app closed."
                : "Get told the moment a message arrives, without keeping the app open."}
          </p>
        </div>

        {state !== "blocked" && (
          <button
            onClick={state === "on" ? disable : enable}
            disabled={busy}
            className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
              state === "on"
                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                : "bg-medical-600 text-white hover:bg-medical-700"
            }`}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "on" ? "Turn off" : "Turn on"}
          </button>
        )}
      </div>
    </div>
  );
}
