"use client";

import { useState, useEffect } from "react";

export function useDashTheme(storageKey = "poveon_dash_theme") {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "light") setIsLight(true);
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
