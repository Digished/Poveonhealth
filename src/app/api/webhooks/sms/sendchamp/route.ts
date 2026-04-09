import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Sendchamp SMS delivery webhook
 * Docs: https://sendchamp.com/docs/api-reference/sms/webhooks
 *
 * Configure this webhook URL in Sendchamp dashboard under Settings > Webhooks:
 * https://your-domain.com/api/webhooks/sms/sendchamp
 *
 * Sendchamp will POST delivery status updates to this endpoint.
 * Webhook payload example:
 * {
 *   "events": [
 *     {
 *       "id": "msg_xxxx",
 *       "status": "Delivered" | "Failed" | "Sent",
 *       "timestamp": "2024-01-15T10:30:00Z"
 *     }
 *   ]
 * }
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate webhook signature (optional but recommended)
    // const signature = request.headers.get("x-sendchamp-signature");
    // if (!validateSignature(body, signature)) {
    //   return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    // }

    // Process delivery status updates
    if (body.events && Array.isArray(body.events)) {
      for (const event of body.events) {
        const messageId = event.id;
        const status = event.status?.toLowerCase() || "unknown";

        // Map Sendchamp status to our status values
        let dbStatus = "pending";
        if (status === "delivered") dbStatus = "delivered";
        else if (status === "sent") dbStatus = "sent";
        else if (status === "failed") dbStatus = "failed";

        // Update SMS log
        const updated = await prisma.smsLog.updateMany({
          where: { provider_msg_id: messageId, provider: "sendchamp" },
          data: { status: dbStatus, updated_at: new Date() },
        });

        if (updated.count === 0) {
          console.warn(`[sendchamp-webhook] Message ID not found: ${messageId}`);
        } else {
          console.log(
            `[sendchamp-webhook] Updated ${updated.count} SMS log(s) to status: ${dbStatus}`
          );
        }
      }
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[sendchamp-webhook] Error processing webhook:", error);
    // Return 200 anyway to prevent Sendchamp from retrying
    return NextResponse.json({ success: false, error: String(error) }, { status: 200 });
  }
}
