import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

/**
 * Verify if the current user is an admin.
 * Uses raw SQL to minimize connection pool usage in serverless environments.
 */
export async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;

  try {
    const adminRecord = await prisma.$queryRaw`SELECT id FROM admin_users WHERE user_id = ${user.id} LIMIT 1`;
    return Array.isArray(adminRecord) && adminRecord.length > 0 ? user : null;
  } catch {
    return null;
  }
}
