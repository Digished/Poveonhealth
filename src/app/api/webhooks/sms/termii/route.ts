import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Termii SMS delivery webhook
 * Docs: https://developers.termii.com/inbound
 *
 * Configure this webhook URL in Termii dashboard under Settings > Webhooks:
 * https://your-domain.com/api/webhooks/sms/termii
 *
 * Termii will POST delivery status updates to this endpoint.
 * Webhook payload example:
 * {
 *   "message_id": "msg_xxxx",
 *   "status": "Delivered" | "Failed" | "Sent",
 *   "timestamp": "2024-01-15T10:30:00Z"
 * }
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const messageId = body.message_id;
    const status = body.status?.toLowerCase() || "unknown";

    if (!messageId) {
      return NextResponse.json(
        { error: "Missing message_id" },
        { status: 400 }
      );
    }

    // Map Termii status to our status values
    let dbStatus = "pending";
    if (status === "delivered") dbStatus = "delivered";
    else if (status === "sent") dbStatus = "sent";
    else if (status === "failed") dbStatus = "failed";

    // Update SMS log
    const updated = await prisma.smsLog.updateMany({
      where: { provider_msg_id: messageId, provider: "termii" },
      data: { status: dbStatus, updated_at: new Date() },
    });

    if (updated.count === 0) {
      console.warn(`[termii-webhook] Message ID not found: ${messageId}`);
    } else {
      console.log(`[termii-webhook] Updated ${updated.count} SMS log(s) to status: ${dbStatus}`);
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[termii-webhook] Error processing webhook:", error);
    // Return 200 anyway to prevent Termii from retrying
    return NextResponse.json({ success: false, error: String(error) }, { status: 200 });
  }
}
