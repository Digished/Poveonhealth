export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
  };
  return map[mime] ?? "bin";
}

/** POST /api/encounter/upload — upload a single photo for an encounter, returns its URL */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Unsupported file type. Allowed: JPEG, PNG, WEBP, HEIC" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "File exceeds 10 MB limit" }, { status: 400 });
    }

    const ext = extFromMime(file.type);
    const filePath = `encounters/${Date.now()}-${randomSuffix()}-${randomSuffix()}.${ext}`;

    const supabase = createAdminClient();
    await supabase.storage.createBucket("encounter-images", { public: true });

    const { error } = await supabase.storage
      .from("encounter-images")
      .upload(filePath, buffer, { contentType: file.type, upsert: false });
    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("encounter-images").getPublicUrl(filePath);

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error) {
    console.error("[encounter/upload]", error);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
