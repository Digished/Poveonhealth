import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/consult";

/**
 * Web push for the installed app.
 *
 * Email already carries everything important; this is for the thing email is
 * bad at — telling a doctor a member has written to them, or a member that
 * their doctor has replied, while the app is closed.
 *
 * Deliberately best-effort throughout. A push that fails must never fail the
 * message it was announcing, so every path here swallows its errors and the
 * caller does not await the result.
 */

export type PushRole = "patient" | "doctor" | "pharmacy";

let configured: boolean | null = null;

/**
 * VAPID identifies this server to the push service. Without the keys there is
 * no push at all — which is a fine state to be in, so it is reported rather
 * than thrown.
 */
function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys are not set — notifications are off.");
    configured = false;
    return false;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@poveon.com",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

export function pushAvailable(): boolean {
  return ensureConfigured();
}

export type PushMessage = {
  title: string;
  body: string;
  /** Where tapping it should land. */
  url?: string;
  /** Collapses repeats: a second message from the same member replaces the first. */
  tag?: string;
};

/**
 * Send to every device this person has registered.
 *
 * A subscription the push service reports as gone (404/410) is deleted — they
 * cleared their data or reinstalled, and retrying it forever is how a push
 * queue silently fills with corpses.
 */
export async function pushTo(role: PushRole, email: string, message: PushMessage): Promise<number> {
  if (!ensureConfigured()) return 0;

  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { role, email: email.toLowerCase(), failed_at: null },
      take: 20,
    });
    if (subs.length === 0) return 0;

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url ?? appUrl(),
      tag: message.tag,
    });

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 12 * 60 * 60, urgency: "high" }
        )
      )
    );

    const dead: string[] = [];
    let sent = 0;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") { sent += 1; return; }
      const status = (r.reason as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) dead.push(subs[i].id);
      else console.error("[push] send failed:", status ?? r.reason);
    });

    if (dead.length) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(() => {});
    }
    if (sent) {
      await prisma.pushSubscription
        .updateMany({
          where: { id: { in: subs.filter((_, i) => results[i].status === "fulfilled").map((s) => s.id) } },
          data: { last_used: new Date() },
        })
        .catch(() => {});
    }
    return sent;
  } catch (err) {
    console.error("[push] could not send:", err);
    return 0;
  }
}

/** Trim a message to something that reads well in a notification. */
export function preview(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
