import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export interface LabAuthResult {
  lab_id: string;
  /** "session" = logged-in lab user via cookie; "api_key" = LIMS/developer via X-Poveon-Api-Key header */
  auth_method: "session" | "api_key";
}

/**
 * Unified lab authentication — checks session cookie first, then X-Poveon-Api-Key header.
 * Returns null if neither method authenticates successfully.
 *
 * Usage in route handlers:
 *   const auth = await getLabAuth(request);
 *   if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 */
export async function getLabAuth(request: NextRequest): Promise<LabAuthResult | null> {
  // 1. Try session cookie (existing portal users)
  try {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (user) {
      const labUser = await prisma.labUser.findUnique({
        where: { user_id: user.id },
        select: { lab_id: true },
      });
      if (labUser) {
        return { lab_id: labUser.lab_id, auth_method: "session" };
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

    // Check expiry
    if (apiKey.expires_at && apiKey.expires_at < new Date()) return null;

    // Update last_used asynchronously — never blocks the response
    prisma.labApiKey
      .update({ where: { id: apiKey.id }, data: { last_used: new Date() } })
      .catch((e) => console.error("[lab-auth] last_used update failed:", e));

    return { lab_id: apiKey.lab_id, auth_method: "api_key" };
  }

  return null;
}
