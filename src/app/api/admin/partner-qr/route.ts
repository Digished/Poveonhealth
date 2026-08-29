export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { partnerJoinUrl, partnerQrPng } from "@/lib/partner-qr";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * GET /api/admin/partner-qr?kind=pharmacy&id=… — a partner's sign-up QR code.
 *
 * The same poster the partner can download for themselves, so an admin can
 * print one on their behalf when setting them up.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const kind = req.nextUrl.searchParams.get("kind") === "lab" ? "lab" : "pharmacy";
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "No partner given." }, { status: 400 });

    let code: string | null = null;
    let name = "partner";

    if (kind === "pharmacy") {
      const pharmacy = await prisma.pharmacy.findUnique({
        where: { id },
        select: { code: true, name: true },
      });
      if (!pharmacy) return NextResponse.json({ error: "Pharmacy not found." }, { status: 404 });
      code = pharmacy.code;
      name = pharmacy.name;
    } else {
      const lab = await prisma.lab.findUnique({ where: { id }, select: { slug: true, name: true } });
      if (!lab) return NextResponse.json({ error: "Lab not found." }, { status: 404 });
      if (!lab.slug) {
        return NextResponse.json(
          { error: "This lab has no slug yet, so it has no scannable link." },
          { status: 400 }
        );
      }
      code = lab.slug;
      name = lab.name;
    }

    if (!code) return NextResponse.json({ error: "That partner has no scannable code." }, { status: 400 });

    const url = partnerJoinUrl(kind, code);
    if (req.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json({ success: true, url, code, name });
    }

    const png = await partnerQrPng(kind, code);
    const safeName = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="poveon-${safeName}-qr.png"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[admin/partner-qr]", err);
    return NextResponse.json({ error: "Could not make that QR code." }, { status: 500 });
  }
}
