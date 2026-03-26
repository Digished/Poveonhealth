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

const BUCKET = "site-assets";
const LOGO_PATH = "logo.svg";

// POST /api/admin/site-assets/logo — upload the site logo/favicon SVG
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("logo") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const allowed = ["image/svg+xml", "image/png", "image/webp", "image/jpeg"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ success: false, error: "Only SVG, PNG, WebP or JPEG files are allowed" }, { status: 400 });
    }

    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "File must be under 2MB" }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // Ensure bucket exists (public so logo URL can be used directly in <img> / metadata)
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find((b) => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    }

    const ext = file.type === "image/svg+xml" ? "svg" : (file.name.split(".").pop() ?? "png");
    const path = ext === "svg" ? LOGO_PATH : `logo.${ext}`;
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { upsert: true, contentType: file.type });

    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ success: true, logo_url: publicUrl });
  } catch (error) {
    console.error("Site logo upload error:", error);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}

// GET /api/admin/site-assets/logo — return the current logo public URL
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const supabaseAdmin = createAdminClient();
    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(LOGO_PATH);

    return NextResponse.json({ success: true, logo_url: publicUrl });
  } catch (error) {
    console.error("Site logo fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to retrieve logo URL" }, { status: 500 });
  }
}
