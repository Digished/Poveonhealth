export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const BUCKET = "pharmacy-logos";

/** POST /api/admin/pharmacies/[id]/logo — upload a pharmacy's logo. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    if (!(await verifyAdmin())) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    // A real, existing UUID — stops a crafted id becoming a storage path.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(params.id)) {
      return NextResponse.json({ success: false, error: "Invalid pharmacy ID" }, { status: 400 });
    }
    const exists = await prisma.pharmacy.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ success: false, error: "Pharmacy not found" }, { status: 404 });
    }

    const file = (await request.formData()).get("logo") as File | null;
    if (!file) return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Only JPEG, PNG, WebP or GIF images are allowed" },
        { status: 400 }
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "Image must be under 5MB" }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find((b) => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
    }

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${params.id}/logo.${ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), { upsert: true, contentType: file.type });
    if (uploadError) {
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    await prisma.pharmacy.update({ where: { id: params.id }, data: { logo_url: publicUrl } });

    return NextResponse.json({ success: true, logo_url: publicUrl });
  } catch (error) {
    console.error("[admin/pharmacies/logo]", error);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
