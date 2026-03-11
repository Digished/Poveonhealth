import { prisma } from "@/lib/prisma";

interface LogEntry {
  method: string;
  path: string;
  status: number;
  lab_id?: string | null;
  duration_ms?: number | null;
}

/**
 * Fire-and-forget API call logger.
 * Always resolves — logging failures never affect API responses.
 * Call with: logApiCall({ method, path, status, lab_id, duration_ms });
 */
export function logApiCall(entry: LogEntry): void {
  prisma.apiLog
    .create({
      data: {
        method: entry.method,
        path: entry.path,
        status: entry.status,
        lab_id: entry.lab_id ?? null,
        duration_ms: entry.duration_ms ?? null,
      },
    })
    .catch((e) => console.error("[api-logger] failed to write log:", e));
}
