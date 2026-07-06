export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin(request: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { hmoId: string } }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const pageSize = 50;

    const where = {
      hmo_id: params.hmoId,
      ...(search
        ? {
            OR: [
              { email: { contains: search.toLowerCase() } },
              { full_name: { contains: search, mode: "insensitive" as const } },
              { policy_number: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [members, total] = await Promise.all([
      prisma.hmoMember.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.hmoMember.count({ where }),
    ]);

    // Individual doctor assignments for the listed members
    const assignments = await prisma.hmoDoctorPatient.findMany({
      where: { member_id: { in: members.map((m) => m.id) } },
      select: { member_id: true, doctor_email: true },
    });
    const assignmentMap = new Map<string, string[]>();
    for (const a of assignments) {
      assignmentMap.set(a.member_id, [...(assignmentMap.get(a.member_id) ?? []), a.doctor_email]);
    }

    return NextResponse.json({
      success: true,
      members: members.map((m) => ({
        ...m,
        assigned_doctors: assignmentMap.get(m.id) ?? [],
      })),
      total,
      page,
      page_size: pageSize,
    });
  } catch (err) {
    console.error("[admin/hmo/members GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
