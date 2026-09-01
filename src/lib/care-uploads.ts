import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Uploads for the care plan — chat photos today, anything else that follows.
 *
 * Buckets are private and created on first use, because nothing in the deploy
 * pipeline creates them and a missing bucket otherwise surfaces as an
 * unexplained 500. The same create-and-retry the credential uploads learned to
 * do, in one place.
 */

export const CHAT_BUCKET = "care-chat";

/** A phone photo of a BP monitor or a strip of tablets; 15MB is plenty. */
export const MAX_IMAGE_MB = 15;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export type UploadResult = { path: string } | { error: string; status: number };

/** A path that leaks nothing: the owner is a hash, the name is random. */
export function carePath(ownerKey: string, ext: string): string {
  const dir = createHash("sha256").update(ownerKey).digest("hex").slice(0, 32);
  const name = createHash("sha256")
    .update(`${ownerKey}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 24);
  return `${dir}/${name}.${ext}`;
}

function extensionFor(type: string, filename: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic" || type === "image/heif") return "heic";
  const guess = filename.split(".").pop();
  return guess && /^[a-z0-9]{2,5}$/i.test(guess) ? guess.toLowerCase() : "jpg";
}

/**
 * Put one image in a private bucket, creating or widening the bucket if the
 * deploy has never done it. Returns the storage path, never a URL — reading it
 * back goes through a signed URL and an authorisation check.
 */
export async function uploadCareImage(
  bucket: string,
  ownerKey: string,
  file: File
): Promise<UploadResult> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("[care-uploads] storage is not configured (missing Supabase env vars)");
    return { error: "Photo storage isn't configured on the server.", status: 503 };
  }
  if (!IMAGE_TYPES.includes(file.type)) {
    return { error: "Attach a JPEG, PNG or WebP photo.", status: 400 };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: `The photo must be under ${MAX_IMAGE_MB}MB.`, status: 400 };
  }

  const supabase = createAdminClient();
  const path = carePath(ownerKey, extensionFor(file.type, file.name));
  const bytes = await file.arrayBuffer();
  const put = () => supabase.storage.from(bucket).upload(path, bytes, { contentType: file.type });

  let { error } = await put();

  // A bucket created by an earlier deploy keeps its original size limit, and
  // Supabase enforces that at the bucket rather than here.
  if (error && /maximum allowed size|payload too large|exceeded/i.test(error.message)) {
    const { error: raiseError } = await supabase.storage.updateBucket(bucket, {
      public: false,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: IMAGE_TYPES,
    });
    if (raiseError) console.error("[care-uploads] could not raise bucket limit:", raiseError.message);
    else ({ error } = await put());
  }

  if (error && /bucket.*not.*found|does not exist/i.test(error.message)) {
    const { error: bucketError } = await supabase.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: IMAGE_TYPES,
    });
    if (bucketError && !/already exists/i.test(bucketError.message)) {
      console.error("[care-uploads] could not create bucket:", bucketError.message);
      return { error: `Could not prepare photo storage: ${bucketError.message}`, status: 500 };
    }
    ({ error } = await put());
  }

  if (error) {
    console.error("[care-uploads] upload failed:", error.message);
    return { error: `Upload failed: ${error.message}`, status: 500 };
  }
  return { path };
}

/** A short-lived link to one stored image, for a caller already authorised. */
export async function signCareImage(bucket: string, path: string, seconds = 300): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Read a chat message that may arrive as JSON or as multipart with a photo.
 *
 * The two clients post the same message either way, so the routes should not
 * have to care which shape turned up.
 */
export async function readChatPayload(
  req: Request
): Promise<{ body: string; file: File | null }> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const raw = form.get("file");
    return {
      body: String(form.get("body") ?? "").trim(),
      file: raw && typeof raw !== "string" ? raw : null,
    };
  }
  const json = await req.json().catch(() => ({}));
  return { body: String(json?.body ?? "").trim(), file: null };
}
