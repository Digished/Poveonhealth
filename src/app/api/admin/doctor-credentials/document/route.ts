export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const BUCKET = "doctor-credentials";
const SLOTS = { license: "license_doc_url", id: "id_doc_url", cv: "cv_url" } as const;

/**
 * GET /api/admin/doctor-credentials/document?email=&slot=
 *
 * Identity documents live in a private bucket, so a reviewer gets a short-lived
 * signed URL rather than a permanent public one.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  const slot = (req.nextUrl.searchParams.get("slot") ?? "") as keyof typeof SLOTS;
  if (!email || !(slot in SLOTS)) {
    return NextResponse.json({ error: "Missing email or document type." }, { status: 400 });
  }

  const credential = await prisma.doctorCredential.findUnique({ where: { email } });
  const path = credential?.[SLOTS[slot]];
  if (!path) return NextResponse.json({ error: "No document on file." }, { status: 404 });

  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 300); // five minutes is long enough to open it

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Could not open that document." }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: data.signedUrl });
}
