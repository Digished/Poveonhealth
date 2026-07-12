export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { logLabActivity } from "@/lib/lab-activity";

const BUCKET = "lab-signatures";
const MAX_BYTES = 2_000_000;

/**
 * POST /api/lab/team/[memberId]/signature
 * Upload a team member's signature image (multipart 'file'). Requires
 * can_manage_team. Stored public; the URL is shown on signed results.
 */
export async function POST(request: NextRequest, { params }: { params: { memberId: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const member = await prisma.labMember.findUnique({ where: { id: params.memberId }, select: { lab_id: true } });
  if (!member || member.lab_id !== auth.lab_id) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!/^image\/(png|jpe?g|webp)/.test(file.type)) return NextResponse.json({ error: "Signature must be a PNG, JPG or WebP image" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 2MB)" }, { status: 400 });

  const supabaseAdmin = await createAdminClient();
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.find((b) => b.name === BUCKET)) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true });
  }
  const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
  const path = `${auth.lab_id}/${params.memberId}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: "Upload failed: " + upErr.message }, { status: 500 });
  const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);

  await prisma.labMember.update({ where: { id: params.memberId }, data: { signature_url: publicUrl } });
  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "member_signature_updated", detail: params.memberId });

  return NextResponse.json({ success: true, signature_url: publicUrl });
}
