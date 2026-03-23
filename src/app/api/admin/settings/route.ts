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

// default_request_price: flat fallback charge for old/image-only requests that have no quoted_price
const ALLOWED_KEYS = ["default_request_price"] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

const DEFAULTS: Record<SettingKey, string> = {
  default_request_price: "500",
};

/** GET /api/admin/settings */
export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.systemSetting.findMany({ where: { key: { in: [...ALLOWED_KEYS] } } });
  const settings: Record<SettingKey, string> = { ...DEFAULTS };
  for (const row of rows) settings[row.key as SettingKey] = row.value;

  return NextResponse.json({ success: true, settings });
}

/** PATCH /api/admin/settings */
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

  const rows = await prisma.systemSetting.findMany({ where: { key: { in: [...ALLOWED_KEYS] } } });
  const settings: Record<SettingKey, string> = { ...DEFAULTS };
  for (const row of rows) settings[row.key as SettingKey] = row.value;

  return NextResponse.json({ success: true, settings });
}
