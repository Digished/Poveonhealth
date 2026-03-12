"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Silently captures ?ref=MARKETER_CODE from the URL and stores it in a
 * 30-day cookie (pov_ref). First-touch only — won't overwrite an existing cookie.
 */
export function RefTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;

    // Only set if no existing cookie (first-touch wins)
    const existing = document.cookie
      .split("; ")
      .find((row) => row.startsWith("pov_ref="));
    if (existing) return;

    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `pov_ref=${encodeURIComponent(ref)}; expires=${expires}; path=/; SameSite=Lax`;
  }, [searchParams]);

  return null;
}
