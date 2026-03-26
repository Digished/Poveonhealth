"use client";

import { useState, useEffect } from "react";

export function useDashTheme(storageKey = "poveon_dash_theme") {
  // Default is light mode; only switch to dark if the user has explicitly chosen it
  const [isLight, setIsLight] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "dark") setIsLight(false);
    } catch { /* ignore */ }
  }, [storageKey]);

  function toggle() {
    setIsLight((prev) => {
      const next = !prev;
      try { localStorage.setItem(storageKey, next ? "light" : "dark"); } catch { /* ignore */ }
      return next;
    });
  }

  return { isLight, toggle, themeClass: isLight ? "dash-light" : "" };
}
