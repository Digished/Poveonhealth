export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getConsultSettings } from "@/lib/consult";
import { partnerJoinUrl, partnerQrPng } from "@/lib/partner-qr";
import { parsePhones } from "@/lib/phones";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * GET /api/admin/partner-promo?kind=lab&id=… — a printable flyer for a partner.
 *
 * Every number on it — the price, both discounts, the message allowance — is
 * read live from the care-plan settings, so changing the price in the admin
 * dashboard changes every flyer printed afterwards. Nothing is baked in.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const kind = req.nextUrl.searchParams.get("kind") === "pharmacy" ? "pharmacy" : "lab";
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "No partner given." }, { status: 400 });

    let code: string | null = null;
    let name = "";
    let addressLine: string | null = null;
    let phone: string | null = null;

    if (kind === "pharmacy") {
      const p = await prisma.pharmacy.findUnique({
        where: { id },
        select: { code: true, name: true, address: true, city: true, state: true, phone: true },
      });
      if (!p) return NextResponse.json({ error: "Pharmacy not found." }, { status: 404 });
      code = p.code;
      name = p.name;
      addressLine = [p.address, p.city, p.state].filter(Boolean).join(", ") || null;
      phone = p.phone;
    } else {
      const l = await prisma.lab.findUnique({
        where: { id },
        select: { slug: true, name: true, address: true, city: true, state: true, phones: true },
      });
      if (!l) return NextResponse.json({ error: "Lab not found." }, { status: 404 });
      if (!l.slug) {
        return NextResponse.json(
          { error: "This lab has no slug yet, so it has no scannable link." },
          { status: 400 }
        );
      }
      code = l.slug;
      name = l.name;
      addressLine = [l.address, l.city, l.state].filter(Boolean).join(", ") || null;
      phone = parsePhones(l.phones)[0]?.number ?? null;
    }

    if (!code) return NextResponse.json({ error: "That partner has no scannable code." }, { status: 400 });

    const [settings, qr] = await Promise.all([
      getConsultSettings(),
      partnerQrPng(kind, code, 600),
    ]);

    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { CarePromoDocument } = await import("@/lib/care-promo-pdf");

    const pdf = await renderToBuffer(
      CarePromoDocument({
        partnerName: name,
        partnerKind: kind,
        addressLine,
        phone,
        // @react-pdf takes an image as a data URI, so the QR is embedded
        // rather than fetched — the flyer renders with no network at all.
        qrDataUri: `data:image/png;base64,${qr.toString("base64")}`,
        joinUrl: partnerJoinUrl(kind, code),
        priceNaira: settings.price_naira,
        labDiscountPercent: settings.lab_discount_percent,
        pharmacyDiscountPercent: settings.pharmacy_discount_percent,
        messageAllowance: settings.message_allowance,
      })
    );

    const safeName = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="poveon-care-plan-${safeName}.pdf"`,
        // Prices change; never let a CDN serve a stale flyer.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[admin/partner-promo]", err);
    return NextResponse.json({ error: "Could not build that flyer." }, { status: 500 });
  }
}
