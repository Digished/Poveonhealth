export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * POST /api/admin/migrate
 * One-shot endpoint to apply any pending DDL that isn't handled by Prisma
 * auto-migration on Vercel deploys.  Safe to call multiple times — every
 * statement uses IF NOT EXISTS / IF EXISTS guards.
 *
 * Add new migrations to the MIGRATIONS array in order; each entry is applied
 * in sequence and skipped silently on error (idempotent).
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const target: string | undefined = body.target; // optional: run only one named migration

  const MIGRATIONS: { name: string; sql: string }[] = [
    {
      name: "price_change_logs",
      sql: `
        CREATE TABLE IF NOT EXISTS "price_change_logs" (
          "id"                  TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
          "lab_offered_test_id" TEXT          NOT NULL,
          "lab_id"              TEXT          NOT NULL,
          "test_name"           TEXT          NOT NULL,
          "changed_by_email"    TEXT          NOT NULL,
          "changed_by_role"     TEXT          NOT NULL DEFAULT 'owner',
          "field_changed"       TEXT          NOT NULL DEFAULT 'lab_price',
          "old_value"           TEXT,
          "new_value"           TEXT,
          "old_price"           DECIMAL(12,2),
          "new_price"           DECIMAL(12,2),
          "changed_at"          TIMESTAMP(3) NOT NULL DEFAULT now(),
          CONSTRAINT "price_change_logs_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "price_change_logs_lab_offered_test_id_idx"
          ON "price_change_logs"("lab_offered_test_id");
        CREATE INDEX IF NOT EXISTS "price_change_logs_lab_id_changed_at_idx"
          ON "price_change_logs"("lab_id", "changed_at");
      `,
    },
  ];

  const toRun = target
    ? MIGRATIONS.filter((m) => m.name === target)
    : MIGRATIONS;

  const results: { name: string; status: "ok" | "error"; message?: string }[] = [];

  for (const migration of toRun) {
    try {
      await prisma.$executeRawUnsafe(migration.sql);
      results.push({ name: migration.name, status: "ok" });
    } catch (err) {
      results.push({
        name: migration.name,
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allOk = results.every((r) => r.status === "ok");
  return NextResponse.json({ success: allOk, results }, { status: allOk ? 200 : 207 });
}

/** GET /api/admin/migrate — lists available migrations */
export async function GET(_req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    migrations: ["price_change_logs"],
    usage: "POST /api/admin/migrate  or  POST /api/admin/migrate { target: 'price_change_logs' }",
  });
}
