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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/admin/labs/[id]/api-keys/[keyId] — revoke an API key
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; keyId: string } }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    if (!UUID_RE.test(params.id) || !UUID_RE.test(params.keyId)) {
      return NextResponse.json({ success: false, error: "Invalid ID" }, { status: 400 });
    }

    // Ensure the key belongs to this lab (prevents cross-lab deletion)
    const existing = await prisma.labApiKey.findFirst({
      where: { id: params.keyId, lab_id: params.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Key not found" }, { status: 404 });
    }

    await prisma.labApiKey.delete({ where: { id: params.keyId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Revoke API key error:", error);
    return NextResponse.json({ success: false, error: "Failed to revoke key" }, { status: 500 });
  }
}
