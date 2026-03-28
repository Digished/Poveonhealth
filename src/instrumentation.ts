/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Used for one-time startup tasks that should not be in API routes.
 */
export async function register() {
  // Only run in the Node.js runtime (not Edge), and not during build
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { fixCommissionPct } = await import("@/lib/startup/fix-commission-pct");
  await fixCommissionPct();
}
