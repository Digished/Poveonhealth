/**
 * Where the browser's install offer is kept.
 *
 * `beforeinstallprompt` fires once, early, and only the listener that is already
 * attached hears it — so a button mounted later in a dashboard would never see
 * it. This module attaches on import and holds the event, so anything that
 * wants to offer an install can ask for it whenever it renders.
 *
 * iOS Safari never fires the event at all; `isIosSafari` is how the callers know
 * to show the manual steps instead.
 */

export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallEvent | null = null;
const listeners = new Set<(e: InstallEvent | null) => void>();

function emit() {
  listeners.forEach((fn) => fn(deferred));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  // Once it is installed the offer is stale, whoever triggered it.
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function getInstallEvent(): InstallEvent | null {
  return deferred;
}

export function onInstallEvent(fn: (e: InstallEvent | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Fire the browser's own install dialog. Returns true if they accepted. */
export async function runInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // The event is single-use: a second prompt() on it throws.
  deferred = null;
  emit();
  return outcome === "accepted";
}

/** Already running as an installed app, so there is nothing to offer. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari, which can install but only by hand. */
export function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}
