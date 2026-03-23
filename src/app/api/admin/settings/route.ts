export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const ALLOWED_KEYS = ["reveal_price"] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

/** GET /api/admin/settings — returns current platform settings */
export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.systemSetting.findMany({ where: { key: { in: [...ALLOWED_KEYS] } } });
  const settings: Record<string, string> = {};
  for (const k of ALLOWED_KEYS) {
    const row = rows.find((r) => r.key === k);
    settings[k] = row?.value ?? (k === "reveal_price" ? "500" : "");
  }
  return NextResponse.json({ success: true, settings });
}

/** PATCH /api/admin/settings — update one or more settings */
export async function PATCH(request: NextRequest) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as Record<string, string>;

  const ops: Promise<unknown>[] = [];
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      const value = String(body[key]).trim();
      ops.push(
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        })
      );
    }
  }
  if (ops.length === 0) return NextResponse.json({ error: "No valid keys provided" }, { status: 400 });
  await Promise.all(ops);

  // Re-fetch and return updated settings
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: [...ALLOWED_KEYS] } } });
  const settings: Record<SettingKey, string> = { reveal_price: "500" };
  for (const row of rows) settings[row.key as SettingKey] = row.value;

  return NextResponse.json({ success: true, settings });
}
