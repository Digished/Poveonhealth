export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BUCKET = "doctor-credentials";

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

    const form = await req.formData();
    const slot = String(form.get("slot") ?? "") as Slot;
    if (!(slot in SLOTS)) {
      return NextResponse.json({ error: "Unknown document type." }, { status: 400 });
    }

    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Upload a JPEG, PNG, WebP or PDF." }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "File must be under 8MB." }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find((b) => b.name === BUCKET)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
    }

    // The email is the key, so hash it rather than putting an address in a path.
    const { createHash } = await import("crypto");
    const dir = createHash("sha256").update(email).digest("hex").slice(0, 32);
    const ext = file.type === "application/pdf" ? "pdf" : (file.name.split(".").pop() ?? "jpg");
    const path = `${dir}/${slot}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, await file.arrayBuffer(), { upsert: true, contentType: file.type });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Store the storage path, not a public URL — the bucket is private.
    await prisma.doctorCredential.upsert({
      where: { email },
      create: { email, [SLOTS[slot]]: path },
      update: { [SLOTS[slot]]: path },
    });

    return NextResponse.json({ success: true, slot, stored: true });
  } catch (err) {
    console.error("[doc-login/credentials/document]", err);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
