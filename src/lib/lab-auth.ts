import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export interface LabPermissions {
  can_view_requests:    boolean;
  can_mark_seen:        boolean;
  can_mark_done:        boolean;
  can_send_results:     boolean;
  can_manage_team:      boolean;
  can_manage_api_keys:  boolean;
  can_view_referrals:   boolean;
  can_view_clients:     boolean;
  can_view_analytics:   boolean;
  can_view_activity:    boolean;
  can_view_feedback:    boolean;
  can_view_wallet:      boolean;
}

/** Full permissions — granted to the lab owner (LabUser) and API keys */
export const FULL_PERMISSIONS: LabPermissions = {
  can_view_requests:     true,
  can_mark_seen:         true,
  can_mark_done:         true,
  can_send_results:      true,
  can_manage_team:       true,
  can_manage_api_keys:   true,
  can_view_referrals:    true,
  can_view_clients:      true,
  can_view_analytics:    true,
  can_view_activity:     true,
  can_view_feedback:     true,
  can_view_wallet:       true,
};

export interface LabAuthResult {
  lab_id:      string;
  /** "session" = logged-in lab user via cookie; "api_key" = LIMS/developer; "member" = lab staff */
  auth_method: "session" | "api_key" | "member";
  permissions: LabPermissions;
  /** Email of the authenticated actor — used for audit trails (undefined for API-key auth) */
  actor_email?: string;
}

/**
 * Unified lab authentication.
 * Priority: session cookie (owner or member) → X-Poveon-Api-Key header
 *
 * Usage in route handlers:
 *   const auth = await getLabAuth(request);
 *   if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   if (!auth.permissions.can_send_results) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 */
export async function getLabAuth(request: NextRequest): Promise<LabAuthResult | null> {
  // 1. Try session cookie — could be lab owner (LabUser) or staff (LabMember)
  try {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (user) {
      // Lab owner path
      if (user.user_metadata?.role === "lab") {
        const labUser = await prisma.labUser.findUnique({
          where: { user_id: user.id },
          select: { lab_id: true },
        });
        if (labUser) {
          return {
            lab_id:      labUser.lab_id,
            auth_method: "session",
            permissions: FULL_PERMISSIONS,
            actor_email: user.email,
          };
        }
      }

      // Lab member path (role-based permissions)
      if (user.user_metadata?.role === "lab_member") {
        const member = await prisma.labMember.findUnique({
          where: { user_id: user.id },
          select: {
            lab_id: true,
            email:  true,
            role: {
              select: {
                can_view_requests:    true,
                can_mark_seen:        true,
                can_mark_done:        true,
                can_send_results:     true,
                can_manage_team:      true,
                can_manage_api_keys:  true,
                can_view_referrals:   true,
                can_view_clients:     true,
                can_view_analytics:   true,
                can_view_activity:    true,
                can_view_feedback:    true,
                can_view_wallet:      true,
              },
            },
          },
        });
        if (member) {
          return {
            lab_id:      member.lab_id,
            auth_method: "member",
            permissions: member.role,
            actor_email: member.email ?? user.email,
          };
        }
      }
    }
  } catch {
    // Cookie auth failed — fall through to API key check
  }

  // 2. Try X-Poveon-Api-Key header (LIMS / developer integrations)
  const rawKey = request.headers.get("X-Poveon-Api-Key");
  if (rawKey) {
    const key_hash = createHash("sha256").update(rawKey).digest("hex");

    const apiKey = await prisma.labApiKey.findUnique({
      where: { key_hash },
      select: { id: true, lab_id: true, expires_at: true },
    });

    if (!apiKey) return null;
    if (apiKey.expires_at && apiKey.expires_at < new Date()) return null;

    // Fire-and-forget last_used update
    prisma.labApiKey
      .update({ where: { id: apiKey.id }, data: { last_used: new Date() } })
      .catch((e) => console.error("[lab-auth] last_used update failed:", e));

    return { lab_id: apiKey.lab_id, auth_method: "api_key", permissions: FULL_PERMISSIONS };
  }

  return null;
}
