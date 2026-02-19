import { PrismaClient } from "@prisma/client";

// Prevent multiple instances during Next.js hot-reload in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Supabase uses PgBouncer in transaction mode on the pooled connection string.
// Prisma prepared statements don't survive across PgBouncer transactions, so we
// must append ?pgbouncer=true&connection_limit=1 to avoid "prepared statement
// does not exist" errors in serverless environments (Vercel).
function buildDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (url.includes("pgbouncer=true")) return url; // already set
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}pgbouncer=true&connection_limit=1`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
