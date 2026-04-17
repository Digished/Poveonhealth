import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Termii SMS delivery-receipt webhook.
 *
 * Configure the Report URL in the Termii dashboard under
 *   Settings → Messaging → Report URL
 * and point it to:
 *   https://your-domain.com/api/webhooks/sms/termii
 *
 * Termii POST payload shape:
 * {
 *   "message_id": "9122821270554876574",
 *   "msisdn": "2348012345678",
 *   "status": "Delivered",          // see STATUS_MAP below
 *   "time_created": "2024-01-15 10:30:00",
 *   "time_sent":    "2024-01-15 10:30:01"
 * }
 */

// Map Termii delivery statuses to our internal status values
const STATUS_MAP: Record<string, string> = {
  // Success
  "delivered": "delivered",
  "successfully sent": "delivered",
  // In-flight
  "sent": "sent",
  "pending": "sent",
  // Failures
  "failed": "failed",
  "dnd active on phone number": "failed",
  "user does not exist": "failed",
  "absent subscriber": "failed",
  "expired": "failed",
  "rejected": "failed",
  "undeliverable": "failed",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const messageId = body.message_id ? String(body.message_id) : null;
    const rawStatus = typeof body.status === "string" ? body.status.toLowerCase().trim() : "";
    const dbStatus = STATUS_MAP[rawStatus] ?? "sent";

    console.log(`[termii-webhook] message_id=${messageId}  status="${body.status}" → "${dbStatus}"`);

    if (!messageId) {
      console.warn("[termii-webhook] Payload missing message_id — ignoring");
      return NextResponse.json({ success: true });
    }

    const updated = await prisma.smsLog.updateMany({
      where: { provider_msg_id: messageId, provider: "termii" },
      data: { status: dbStatus, updated_at: new Date() },
    });

    if (updated.count === 0) {
      // Could be a message sent before logging was wired up — not an error
      console.warn(`[termii-webhook] No sms_log row found for message_id ${messageId}`);
    } else {
      console.log(`[termii-webhook] Updated ${updated.count} row(s) → "${dbStatus}"`);
    }

    // Always 200 — Termii does not retry on failure but we ack cleanly regardless
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[termii-webhook] Error:", error);
    return NextResponse.json({ success: true }); // still 200 to prevent spurious retries
  }
}
