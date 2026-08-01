export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, formDataToParams } from "@/lib/whatsapp/twilio";
import { fromWhatsAppAddress } from "@/lib/whatsapp/phone";
import { formatLabPhones } from "@/lib/whatsapp/templates";
import { parsePhones } from "@/lib/phones";

/**
 * Inbound WhatsApp messages from Twilio.
 *
 * Configure in the Twilio console under
 *   Messaging → Services → your service → Integration → "Send a webhook"
 * (or Phone Numbers → your WhatsApp sender → "A message comes in"):
 *   https://your-domain.com/api/webhooks/whatsapp/twilio/inbound
 *
 * Any inbound message opens a 24-hour customer-service window, during which we
 * may send free-form text without an approved template — so this endpoint is
 * what makes template-less replies possible at all.
 *
 * Replies are returned as TwiML, which keeps the lookup stateless: no outbound
 * API call, no extra Twilio charge for the response.
 */

// Codes look like "LABA-8X4K29Q" — a 2–4 char lab prefix, a dash, 7 chars.
const CODE_PATTERN = /\b([A-Z]{2,4}-[A-Z0-9]{5,10})\b/i;

function twiml(message?: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function requestUrl(request: NextRequest): string {
  const explicit = process.env.TWILIO_INBOUND_WEBHOOK_URL?.trim();
  if (explicit) return explicit;

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}${request.nextUrl.pathname}`;
  return request.nextUrl.href;
}

const STATUS_LABEL: Record<string, string> = {
  incoming: "Received — the lab is expecting you",
  seen: "In progress at the lab",
  done: "Completed — your results have been sent",
  cancelled: "Cancelled",
};

/** Look up a request by code and describe it, including the lab's address. */
async function describeRequest(code: string): Promise<string | null> {
  const req = await prisma.request.findUnique({
    where: { code: code.toUpperCase() },
    select: {
      code: true,
      status: true,
      patient_name: true,
      lab: { select: { name: true, address: true, phones: true } },
    },
  });
  if (!req) return null;

  const phones = formatLabPhones(parsePhones(req.lab.phones));
  const status = STATUS_LABEL[req.status] ?? req.status;

  return (
    `*${req.code}*\n` +
    `Status: ${status}\n` +
    `Lab: ${req.lab.name}\n` +
    (req.lab.address ? `Address: ${req.lab.address}\n` : "") +
    (phones ? `Phone: ${phones}\n` : "") +
    `\nShow this code at the lab reception.`
  );
}

export async function POST(request: NextRequest) {
  try {
    const params = formDataToParams(await request.formData());

    const signature = request.headers.get("x-twilio-signature");
    if (!verifyTwilioSignature(requestUrl(request), params, signature)) {
      console.warn("[twilio-wa-inbound] Invalid or missing X-Twilio-Signature — rejecting");
      return new Response("Invalid signature", { status: 403 });
    }

    const from = fromWhatsAppAddress(params.From ?? "");
    const body = (params.Body ?? "").trim();
    console.log(`[twilio-wa-inbound] from=${from} body="${body.slice(0, 120)}"`);

    if (!body) return twiml();

    // Twilio handles STOP/START opt-out for WhatsApp itself; don't reply over it.
    if (/^(stop|unstop|start|cancel|quit|end)$/i.test(body)) return twiml();

    const match = body.match(CODE_PATTERN);
    if (match) {
      const description = await describeRequest(match[1]);
      return twiml(
        description ??
          `We couldn't find a request with the code ${match[1].toUpperCase()}. Please check the code and try again.`
      );
    }

    return twiml(
      "Thanks for messaging Poveon Health 👋\n\n" +
        "Reply with your request code (e.g. LABA-8X4K29Q) to see its status and your lab's address.\n\n" +
        "For anything else, visit https://poveon.com"
    );
  } catch (error) {
    console.error("[twilio-wa-inbound] Error:", error);
    return twiml();
  }
}
