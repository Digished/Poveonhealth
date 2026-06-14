export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";
import { getDoctorEmailFromRequest } from "@/lib/doctor-encounter";
import { ensureEncounterSchema } from "@/lib/startup/ensure-encounter-schema";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function ext(mime: string): string {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[mime] ?? "bin";
}

/** POST /api/doc-login/avatar — upload the doctor's optional profile photo. */
export async function POST(req: NextRequest) {
  try {
    const email = await getDoctorEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Use a JPEG, PNG, or WEBP image." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image exceeds 5 MB limit." }, { status: 400 });
    }

    const supabase = createAdminClient();
    await supabase.storage.createBucket("doctor-avatars", { public: true });
    const path = `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext(file.type)}`;
    const { error } = await supabase.storage.from("doctor-avatars").upload(path, buffer, { contentType: file.type, upsert: false });
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from("doctor-avatars").getPublicUrl(path);

    await ensureEncounterSchema().catch(() => {});
    await prisma.doctorProfile.upsert({
      where: { email },
      create: { email, claimed: true, avatar_url: publicUrl },
      update: { avatar_url: publicUrl },
    });

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error("[doc-login/avatar]", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

/** DELETE /api/doc-login/avatar — remove the profile photo. */
export async function DELETE(req: NextRequest) {
  try {
    const email = await getDoctorEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    await ensureEncounterSchema().catch(() => {});
    await prisma.doctorProfile.update({ where: { email }, data: { avatar_url: null } }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/avatar DELETE]", err);
    return NextResponse.json({ error: "Failed to remove photo." }, { status: 500 });
  }
}
