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

const BUCKET = "lab-logos";

// POST /api/admin/labs/[id]/logo — upload a logo image for a lab
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    // Validate lab ID is a real UUID that exists — prevents path traversal via storage key
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(params.id)) {
      return NextResponse.json({ success: false, error: "Invalid lab ID" }, { status: 400 });
    }
    const labExists = await prisma.lab.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!labExists) {
      return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("logo") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ success: false, error: "Only JPEG, PNG, WebP or GIF images are allowed" }, { status: 400 });
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "Image must be under 5MB" }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // Ensure bucket exists
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find((b) => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${params.id}/logo.${ext}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { upsert: true, contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    await prisma.lab.update({ where: { id: params.id }, data: { logo_url: publicUrl } });

    return NextResponse.json({ success: true, logo_url: publicUrl });
  } catch (error) {
    console.error("Logo upload error:", error);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
