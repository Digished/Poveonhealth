export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

// GET /api/admin/agreements/[id]/pdf — returns a short-lived signed download URL
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  if (!adminRecord) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const agreement = await prisma.labAgreement.findUnique({
    where: { id: params.id },
    select: { pdf_url: true, signer_name: true, lab: { select: { name: true } } },
  });
  if (!agreement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createAdminClient();
  const { data, error } = await supabase.storage
    .from("agreements")
    .createSignedUrl(agreement.pdf_url, 300); // 5-minute download link

  if (error || !data) {
    return NextResponse.json({ error: "Could not generate download link" }, { status: 500 });
  }

  return NextResponse.json({ success: true, url: data.signedUrl });
}
