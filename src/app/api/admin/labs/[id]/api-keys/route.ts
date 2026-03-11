export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateKeySchema = z.object({
  name: z.string().min(1).max(80),
  expires_at: z.string().datetime().optional(),
});

// GET /api/admin/labs/[id]/api-keys — list API keys for a lab
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    if (!UUID_RE.test(params.id)) {
      return NextResponse.json({ success: false, error: "Invalid lab ID" }, { status: 400 });
    }

    const keys = await prisma.labApiKey.findMany({
      where: { lab_id: params.id },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        name: true,
        key_prefix: true,
        last_used: true,
        expires_at: true,
        created_at: true,
      },
    });

    return NextResponse.json({ success: true, keys });
  } catch (error) {
    console.error("List API keys error:", error);
    return NextResponse.json({ success: false, error: "Failed to list keys" }, { status: 500 });
  }
}

// POST /api/admin/labs/[id]/api-keys — generate a new API key for a lab
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    if (!UUID_RE.test(params.id)) {
      return NextResponse.json({ success: false, error: "Invalid lab ID" }, { status: 400 });
    }

    const labExists = await prisma.lab.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!labExists) {
      return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = CreateKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }

    // Generate a cryptographically secure key: pvn_live_<32 random bytes hex>
    const rawKey = `pvn_live_${randomBytes(32).toString("hex")}`;
    const key_hash = createHash("sha256").update(rawKey).digest("hex");
    const key_prefix = rawKey.slice(0, 12); // "pvn_live_xxxx"

    const apiKey = await prisma.labApiKey.create({
      data: {
        lab_id: params.id,
        name: parsed.data.name,
        key_hash,
        key_prefix,
        expires_at: parsed.data.expires_at ? new Date(parsed.data.expires_at) : null,
      },
      select: {
        id: true,
        name: true,
        key_prefix: true,
        expires_at: true,
        created_at: true,
      },
    });

    // Return the raw key ONCE — it is never stored and cannot be retrieved again
    return NextResponse.json({ success: true, key: rawKey, ...apiKey });
  } catch (error) {
    console.error("Create API key error:", error);
    return NextResponse.json({ success: false, error: "Failed to create key" }, { status: 500 });
  }
}
