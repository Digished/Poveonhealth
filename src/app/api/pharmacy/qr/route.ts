export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getPharmacyFromRequest } from "@/lib/consult";
import { partnerJoinUrl, partnerQrPng } from "@/lib/partner-qr";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/pharmacy/qr — the pharmacy's own sign-up QR code.
 *
 * `?format=json` returns the link to show on screen; anything else returns a
 * PNG the pharmacy can print and stand on the counter.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const url = partnerJoinUrl("pharmacy", pharmacy.code);
    if (req.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json({ success: true, url, code: pharmacy.code, name: pharmacy.name });
    }

    const png = await partnerQrPng("pharmacy", pharmacy.code);
    const safeName = pharmacy.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="poveon-${safeName}-qr.png"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[pharmacy/qr]", err);
    return NextResponse.json({ error: "Could not make that QR code." }, { status: 500 });
  }
}
