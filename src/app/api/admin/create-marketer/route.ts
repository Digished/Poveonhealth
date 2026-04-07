export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const CreateMarketerSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
});

function generateMarketerCode(name: string): string {
  // Take up to 6 alphanumeric chars from the name + 3 random digits
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)
    .padEnd(3, "X");
  const suffix = String(Math.floor(100 + Math.random() * 900));
  return `${base}${suffix}`;
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
    if (!adminRecord) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = CreateMarketerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, phone } = parsed.data;

    // Generate a unique marketer code with collision detection
    let code = generateMarketerCode(name);
    for (let attempt = 0; attempt < 10; attempt++) {
      const existing = await prisma.marketer.findUnique({ where: { code }, select: { id: true } });
      if (!existing) break;
      code = generateMarketerCode(name);
      if (attempt === 9) {
        return NextResponse.json(
          { success: false, error: "Could not generate a unique code. Please try again." },
          { status: 500 }
        );
      }
    }

    let marketer;
    try {
      marketer = await prisma.marketer.create({
        data: { name, email, phone: phone || null, code },
      });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr?.code === "P2002") {
        return NextResponse.json(
          { success: false, error: "A marketer with that email already exists" },
          { status: 409 }
        );
      }
      throw err;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://poveon.com";
    const referralLink = `${appUrl}/?ref=${marketer.code}`;

    return NextResponse.json({ success: true, marketer, referral_link: referralLink });
  } catch (error) {
    console.error("[admin/create-marketer]", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
    if (!adminRecord) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const marketers = await prisma.marketer.findMany({
      orderBy: { created_at: "desc" },
      include: {
        _count: { select: { doctor_links: true } },
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://poveon.com";

    return NextResponse.json({
      success: true,
      marketers: marketers.map((m) => ({
        ...m,
        doctor_count: m._count.doctor_links,
        referral_link: `${appUrl}/?ref=${m.code}`,
      })),
    });
  } catch (error) {
    console.error("[admin/create-marketer GET]", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}
