export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const BUCKET = "lab-assets";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/admin/labs/[id]/hero — upload a hero background image for a lab's unique page
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

    const formData = await request.formData();
    const file = formData.get("hero") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ success: false, error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 });
    }

    const MAX_SIZE = 8 * 1024 * 1024; // 8MB for hero images
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "Image must be under 8MB" }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find((b) => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${params.id}/hero.${ext}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { upsert: true, contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    await prisma.lab.update({ where: { id: params.id }, data: { hero_image_url: publicUrl } });

    return NextResponse.json({ success: true, hero_image_url: publicUrl });
  } catch (error) {
    console.error("Hero image upload error:", error);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}

// DELETE /api/admin/labs/[id]/hero — remove the hero image
export async function DELETE(
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

    await prisma.lab.update({ where: { id: params.id }, data: { hero_image_url: null } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Hero image delete error:", error);
    return NextResponse.json({ success: false, error: "Failed to remove hero image" }, { status: 500 });
  }
}
