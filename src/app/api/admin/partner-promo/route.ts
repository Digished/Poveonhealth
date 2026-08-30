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
    let logoUrl: string | null = null;

    if (kind === "pharmacy") {
      const p = await prisma.pharmacy.findUnique({
        where: { id },
        select: {
          code: true, name: true, address: true, city: true, state: true,
          phone: true, logo_url: true,
        },
      });
      if (!p) return NextResponse.json({ error: "Pharmacy not found." }, { status: 404 });
      code = p.code;
      name = p.name;
      addressLine = [p.address, p.city, p.state].filter(Boolean).join(", ") || null;
      phone = p.phone;
      logoUrl = p.logo_url;
    } else {
      const l = await prisma.lab.findUnique({
        where: { id },
        select: {
          slug: true, name: true, address: true, city: true, state: true,
          phones: true, logo_url: true,
        },
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
      logoUrl = l.logo_url;
    }

    if (!code) return NextResponse.json({ error: "That partner has no scannable code." }, { status: 400 });

    const [settings, qr, logoDataUri] = await Promise.all([
      getConsultSettings(),
      partnerQrPng(kind, code, 600),
      fetchLogoDataUri(logoUrl),
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
        logoDataUri,
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


/**
 * The partner's logo, inlined so the PDF renders with no network of its own.
 *
 * Best-effort by design: a partner without a logo, or one whose logo has gone
 * missing, still gets a flyer with their initial in a mark. A broken image URL
 * must not cost them their poster.
 */
async function fetchLogoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    // react-pdf only takes PNG and JPEG; an SVG logo would render as nothing.
    if (!/image\/(png|jpe?g)/i.test(type)) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > 2 * 1024 * 1024) return null;
    return `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
