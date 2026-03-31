export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

// PATCH /api/admin/labs/[id] — edit a lab (name, address, phones, hidden)
const PatchSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  address: z.string().min(1).max(500).optional(),
  description: z.string().max(1000).optional(),
  phones: z.array(z.object({ number: z.string().min(1), label: z.string() })).optional(),
  notification_email: z.string().email().nullable().optional(),
  hidden: z.boolean().optional(),
  search_hidden: z.boolean().optional(),
  service_categories: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80).nullable().optional(),
  whatsapp: z.string().max(500).nullable().optional(),
  request_email: z.string().email().nullable().optional(),
  staff_contacts: z.array(z.object({ title: z.string().min(1).max(50), email: z.string().email() })).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }

    const lab = await prisma.lab.update({
      where: { id: params.id },
      data: parsed.data,
    });

    return NextResponse.json({ success: true, lab });
  } catch (error) {
    console.error("Lab PATCH error:", error);
    return NextResponse.json({ success: false, error: "Failed to update lab" }, { status: 500 });
  }
}

// DELETE /api/admin/labs/[id] — delete a lab and its auth user
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    // Find the linked auth user via lab_users
    const labUser = await prisma.labUser.findFirst({ where: { lab_id: params.id } });

    // Delete requests first (no cascade on requests FK), then lab (cascades lab_users)
    await prisma.request.deleteMany({ where: { lab_id: params.id } });
    await prisma.lab.delete({ where: { id: params.id } });

    // Delete the Supabase auth user if found
    if (labUser) {
      const supabaseAdmin = createAdminClient();
      await supabaseAdmin.auth.admin.deleteUser(labUser.user_id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lab DELETE error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete lab" }, { status: 500 });
  }
}
