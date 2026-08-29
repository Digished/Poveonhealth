export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BUCKET = "doctor-credentials";

/** Scans of a practising licence are often large; 15MB covers a phone photo. */
const MAX_MB = 15;
const MAX_BYTES = MAX_MB * 1024 * 1024;

/** Which document slot is being filled. */
const SLOTS = { license: "license_doc_url", id: "id_doc_url", cv: "cv_url" } as const;
type Slot = keyof typeof SLOTS;

/**
 * POST /api/doc-login/credentials/document — attach a licence, ID or CV.
 *
 * The bucket is private: these are identity documents, so they're reachable
 * only through a signed URL an admin requests while reviewing.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    // Without the service-role key there is no way to write to storage at all,
    // and the failure is otherwise a confusing 500 deep inside the SDK.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error("[credentials/document] storage is not configured (missing Supabase env vars)");
      return NextResponse.json(
        { error: "Document storage isn't configured on the server. Please contact support." },
        { status: 503 }
      );
    }

    const form = await req.formData();
    const slot = String(form.get("slot") ?? "") as Slot;
    if (!(slot in SLOTS)) {
      return NextResponse.json({ error: "Unknown document type." }, { status: 400 });
    }

    // While an application is with a reviewer, its documents are frozen —
    // otherwise the thing being reviewed can change underneath them.
    const credential = await prisma.doctorCredential.findUnique({
      where: { email },
      select: { status: true },
    });
    if (credential?.status === "pending") {
      return NextResponse.json(
        { error: "Your application is with the review team — you can't change documents until they respond." },
        { status: 409 }
      );
    }

    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Upload a JPEG, PNG, WebP or PDF." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File must be under ${MAX_MB}MB.` }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // The email is the key, so hash it rather than putting an address in a path.
    const dir = createHash("sha256").update(email).digest("hex").slice(0, 32);
    const ext = file.type === "application/pdf" ? "pdf" : (file.name.split(".").pop() ?? "jpg");
    const path = `${dir}/${slot}.${ext}`;
    const bytes = await file.arrayBuffer();

    const put = () =>
      supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, bytes, { upsert: true, contentType: file.type });

    let { error: uploadError } = await put();

    // A bucket made by an earlier deploy keeps the size limit it was created
    // with, and Supabase enforces that at the bucket rather than here — so an
    // "exceeded the maximum" rejection means the bucket needs raising.
    if (uploadError && /maximum allowed size|payload too large|exceeded/i.test(uploadError.message)) {
      const { error: raiseError } = await supabaseAdmin.storage.updateBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: allowed,
      });
      if (raiseError) {
        console.error("[credentials/document] could not raise the bucket limit:", raiseError.message);
      } else {
        ({ error: uploadError } = await put());
      }
    }

    // First upload for this deployment: the bucket won't exist yet. Create it
    // (private — these are identity documents) and try once more.
    if (uploadError) {
      const missing = /bucket.*not.*found|does not exist/i.test(uploadError.message);
      if (!missing) {
        console.error("[credentials/document] upload failed:", uploadError.message);
        return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
      }

      const { error: bucketError } = await supabaseAdmin.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: allowed,
      });
      // "already exists" is fine — another request may have won the race.
      if (bucketError && !/already exists/i.test(bucketError.message)) {
        console.error("[credentials/document] could not create bucket:", bucketError.message);
        return NextResponse.json(
          { error: `Could not prepare document storage: ${bucketError.message}` },
          { status: 500 }
        );
      }

      ({ error: uploadError } = await put());
      if (uploadError) {
        console.error("[credentials/document] upload failed after bucket create:", uploadError.message);
        return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
      }
    }

    // Store the storage path, not a public URL — the bucket is private.
    await prisma.doctorCredential.upsert({
      where: { email },
      create: { email, [SLOTS[slot]]: path },
      update: { [SLOTS[slot]]: path },
    });

    return NextResponse.json({ success: true, slot, stored: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    console.error("[credentials/document]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
