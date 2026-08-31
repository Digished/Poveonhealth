"use client";

/**
 * The strip of sub-sections inside an admin page.
 *
 * These were plain `flex` rows. With five entries and labels like "Doctor
 * approvals" and "Health statistics" that is fine on a desk and a mess on a
 * phone: no wrap and no scroll, so flex squeezes every pill until the labels
 * break across lines inside them and the icons collide with the text.
 *
 * So it scrolls instead of squeezing. Each pill keeps its natural width, the
 * strip snaps, and a fade on whichever edge has more content says there is more
 * to see — a scroller with no affordance is just a row that looks cut off.
 * Selecting a tab scrolls it into view, which matters when the active one is
 * the fifth of five and off-screen on arrival.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type SubTabItem<K extends string> = {
  key: K;
  label: string;
  icon?: LucideIcon;
  /** Count beside the label, hidden when zero. */
  badge?: number;
};

export function SubTabs<K extends string>({
  items,
  value,
  onChange,
  className = "",
}: {
  items: readonly SubTabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, items.length]);

  // Bring the active tab into view — on first paint too, since the active one
  // can be the last of five and entirely off-screen on a phone.
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-key="${value}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [value, measure]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={scroller}
        onScroll={measure}
        role="tablist"
        className="no-scrollbar flex snap-x snap-mandatory gap-1 overflow-x-auto rounded-xl p-1"
        style={{ background: "var(--dash-surface-2)", border: "1px solid var(--dash-border)" }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.key === value;
          return (
            <button
              key={item.key}
              data-key={item.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.key)}
              className="dash-ring flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] transition-colors sm:px-3.5 sm:text-sm"
              style={{
                background: active ? "var(--dash-accent-bg)" : "transparent",
                color: active ? "var(--dash-accent)" : "var(--dash-muted)",
                fontWeight: active ? 650 : 500,
              }}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              {item.label}
              {!!item.badge && item.badge > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                  style={{ background: "var(--dash-surface-3)", color: "var(--dash-text)" }}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Edge fades — only on the side that actually has more. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-1 left-1 w-8 rounded-l-xl transition-opacity duration-200 ${
          edges.left ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "linear-gradient(to right, var(--dash-surface-2), transparent)" }}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-1 right-1 w-8 rounded-r-xl transition-opacity duration-200 ${
          edges.right ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "linear-gradient(to left, var(--dash-surface-2), transparent)" }}
      />
    </div>
  );
}
