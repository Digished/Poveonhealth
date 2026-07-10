"use client";

import { useState, useEffect } from "react";

export function useDashTheme(storageKey = "poveon_dash_theme") {
  // Default is dark mode; only switch to light if the user has explicitly chosen it.
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "light") setIsLight(true);
    } catch { /* ignore */ }
  }, [storageKey]);

  // Mirror the theme class onto <body>. Modals and dropdowns are portal-
  // rendered into document.body, so a class on the dashboard wrapper alone
  // never reaches them — this is what makes popups follow light mode.
  useEffect(() => {
    document.body.classList.toggle("dash-light", isLight);
    return () => { document.body.classList.remove("dash-light"); };
  }, [isLight]);

  function toggle() {
    setIsLight((prev) => {
      const next = !prev;
      try { localStorage.setItem(storageKey, next ? "light" : "dark"); } catch { /* ignore */ }
      return next;
    });
  }

  return { isLight, toggle, themeClass: isLight ? "dash-light" : "" };
}
