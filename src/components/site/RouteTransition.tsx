"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Makes navigation between pages feel continuous:
 *
 *  • a hairline progress bar appears as soon as an internal link is clicked
 *    (App Router gives no navigation-start event, so we listen for the click)
 *  • the incoming page fades + lifts in, keyed on the pathname
 *
 * Wraps the whole app in the root layout. The wrapper element carries no
 * layout of its own, so pages keep controlling their own height/scrolling.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const currentPath = useRef(pathname);

  // Navigation finished when the pathname actually changed.
  useEffect(() => {
    if (currentPath.current !== pathname) {
      currentPath.current = pathname;
      setLoading(false);
    }
  }, [pathname]);

  // Navigation started — an internal anchor was activated.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      // Same-page anchors and external/protocol links don't navigate the app.
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let url: URL;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      setLoading(true);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Safety valve — never leave the bar spinning if a navigation is cancelled.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(t);
  }, [loading]);

  return (
    <>
      <div
        aria-hidden="true"
        className={`fixed inset-x-0 top-0 z-[10000] h-0.5 transition-opacity duration-200 ${
          loading ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {loading && (
          <div className="route-progress-bar h-full w-full bg-gradient-to-r from-medical-500 via-medical-400 to-sky-300 shadow-[0_0_12px_rgba(2,112,195,0.5)]" />
        )}
      </div>

      <div key={pathname} className="page-enter">
        {children}
      </div>
    </>
  );
}
