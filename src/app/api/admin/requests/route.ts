import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    // Authenticate and verify admin role
    const authClient = await createServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const adminClient = createAdminClient();

    const { data: adminUser } = await adminClient
      .from("admin_users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!adminUser) {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const labId = searchParams.get("lab_id");
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
    const offset = (page - 1) * limit;

    let query = adminClient
      .from("requests")
      .select("*, labs(name, addresses)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (labId) query = query.eq("lab_id", labId);
    if (status) query = query.eq("status", status);

    const { data: requests, error, count } = await query;

    if (error) {
      console.error("Admin requests error:", error);
      return NextResponse.json(
        { success: false, error: "Database error" },
        { status: 500 }
      );
    }

    // Compute metrics
    const { data: metrics } = await adminClient
      .from("requests")
      .select("status, lab_id, labs(name)");

    const byStatus = { incoming: 0, seen: 0, done: 0 };
    const byLabMap: Record<string, { lab_name: string; total: number }> = {};

    for (const r of metrics ?? []) {
      byStatus[r.status as keyof typeof byStatus]++;
      if (!byLabMap[r.lab_id]) {
        byLabMap[r.lab_id] = {
          lab_name: (r.labs as { name: string } | null)?.name ?? r.lab_id,
          total: 0,
        };
      }
      byLabMap[r.lab_id].total++;
    }

    const byLab = Object.entries(byLabMap).map(([lab_id, v]) => ({
      lab_id,
      ...v,
    }));

    return NextResponse.json({
      success: true,
      requests,
      total: count ?? 0,
      page,
      metrics: {
        total: (metrics ?? []).length,
        ...byStatus,
        byLab,
      },
    });
  } catch (error) {
    console.error("Admin requests error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
