"use client";

/**
 * The admin dashboard's navigation.
 *
 * What it replaces: twenty-two flat tabs in a horizontal strip that only fitted
 * about six at a time, and — on mobile — the same twenty-two as one unbroken
 * dropdown list. Neither told you where anything was; you scrolled until you
 * recognised a word.
 *
 * So the sections are grouped by what someone is actually doing — running the
 * day, managing partners, care, growth, the platform itself — and the groups
 * are the navigation. On a wide screen that is a sticky sidebar; below `lg` it
 * is a sheet that opens from the header, keeps the group headings, and closes
 * on pick. Search is there because six groups still beats scrolling, but typing
 * three letters beats both.
 *
 * Colours come from the `--dash-*` tokens rather than dark utility classes, so
 * light mode is a value swap and cannot leak.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X, type LucideIcon } from "lucide-react";
import { Portal, useViewport } from "@/components/ui/Overlay";

export type AdminNavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Shown beside the label when non-zero — things waiting on someone. */
  badge?: number;
  /** One-line description, used by search and the mobile sheet. */
  hint?: string;
};

export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export function AdminNav({
  groups,
  activeKey,
  onSelect,
  open,
  onOpenChange,
}: {
  groups: AdminNavGroup[];
  activeKey: string;
  onSelect: (key: string) => void;
  /** Mobile sheet state, owned by the shell so the header button can drive it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const all = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const current = all.find((i) => i.key === activeKey) ?? all[0];

  return (
    <>
      <DesktopSidebar groups={groups} activeKey={activeKey} onSelect={onSelect} />
      <MobileSheet
        groups={groups}
        activeKey={activeKey}
        current={current}
        open={open}
        onOpenChange={onOpenChange}
        onSelect={(k) => {
          onSelect(k);
          onOpenChange(false);
        }}
      />
    </>
  );
}

// ── Desktop ────────────────────────────────────────────────────────────────

function DesktopSidebar({
  groups,
  activeKey,
  onSelect,
}: {
  groups: AdminNavGroup[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = filterGroups(groups, query);

  return (
    <aside className="hidden lg:block w-[236px] shrink-0">
      <nav
        className="dash-panel slim-scroll sticky top-[4.75rem] max-h-[calc(100dvh-6.5rem)] overflow-y-auto rounded-2xl p-2.5"
        style={{ boxShadow: "var(--dash-shadow)" }}
        aria-label="Admin sections"
      >
        <div className="relative mb-2.5">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            style={{ color: "var(--dash-faint)" }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to…"
            aria-label="Filter sections"
            className="dash-ring w-full rounded-lg py-2 pl-8 pr-7 text-xs outline-none"
            style={{
              background: "var(--dash-surface-2)",
              border: "1px solid var(--dash-border)",
              color: "var(--dash-text)",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1"
              style={{ color: "var(--dash-faint)" }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="dash-muted px-2 py-6 text-center text-xs">
            Nothing matches &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <div className="space-y-3">
            {shown.map((group) => (
              <div key={group.label}>
                <p
                  className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.13em]"
                  style={{ color: "var(--dash-faint)" }}
                >
                  {group.label}
                </p>
                <div className="space-y-px">
                  {group.items.map((item) => (
                    <NavRow
                      key={item.key}
                      item={item}
                      active={item.key === activeKey}
                      onClick={() => onSelect(item.key)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}

function NavRow({
  item,
  active,
  onClick,
  large = false,
}: {
  item: AdminNavItem;
  active: boolean;
  onClick: () => void;
  large?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`dash-ring group flex w-full items-center gap-2.5 rounded-lg text-left transition-colors ${
        large ? "px-3 py-3 text-sm" : "px-2 py-[7px] text-[13px]"
      }`}
      style={{
        background: active ? "var(--dash-accent-bg)" : "transparent",
        color: active ? "var(--dash-accent)" : "var(--dash-text-2)",
        fontWeight: active ? 650 : 500,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--dash-surface-2)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon
        className={large ? "h-[18px] w-[18px] shrink-0" : "h-4 w-4 shrink-0"}
        style={{ color: active ? "var(--dash-accent)" : "var(--dash-muted)" }}
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {!!item.badge && item.badge > 0 && (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
          style={{ background: "var(--dash-surface-3)", color: "var(--dash-text)" }}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </button>
  );
}

// ── Mobile ─────────────────────────────────────────────────────────────────

/**
 * A sheet rather than a dropdown.
 *
 * The old dropdown was absolutely positioned inside the scrolling page, so on a
 * short screen the last third of it sat below the fold with no way to reach it.
 * This is portalled to the body and sized against `visualViewport`, so it fits
 * the screen that actually exists — including when a keyboard is up over it.
 */
function MobileSheet({
  groups,
  activeKey,
  current,
  open,
  onOpenChange,
  onSelect,
}: {
  groups: AdminNavGroup[];
  activeKey: string;
  current: AdminNavItem | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const vp = useViewport(open);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const shown = filterGroups(groups, query);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  return (
    <>
      <div className="lg:hidden mb-4">
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="dash-panel dash-ring flex w-full items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm font-semibold"
          style={{ color: "var(--dash-text)" }}
        >
          {current && (
            <current.icon className="h-4 w-4 shrink-0" style={{ color: "var(--dash-accent)" }} />
          )}
          <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? "Sections"}</span>
          <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--dash-muted)" }} />
        </button>
      </div>

      {open && (
        <Portal>
          <div
            className="lg:hidden fixed inset-0 z-[300] flex flex-col justify-end"
            style={{
              height: vp.height || undefined,
              top: vp.top || 0,
            }}
          >
            <button
              aria-label="Close menu"
              onClick={() => onOpenChange(false)}
              className="animate-backdrop-in absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            />

            <div
              className="animate-sheet-drop relative flex max-h-[88%] flex-col overflow-hidden rounded-t-3xl"
              style={{
                background: "var(--dash-elevated)",
                borderTop: "1px solid var(--dash-border)",
                boxShadow: "var(--dash-shadow)",
              }}
            >
              <div
                className="flex items-center gap-2 px-4 pb-3 pt-3"
                style={{ borderBottom: "1px solid var(--dash-border)" }}
              >
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: "var(--dash-faint)" }}
                  />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search sections"
                    aria-label="Search sections"
                    className="dash-ring w-full rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none"
                    style={{
                      background: "var(--dash-surface-2)",
                      border: "1px solid var(--dash-border)",
                      color: "var(--dash-text)",
                    }}
                  />
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                  className="dash-ring shrink-0 rounded-xl p-2.5"
                  style={{ background: "var(--dash-surface-2)", color: "var(--dash-muted)" }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="slim-scroll overflow-y-auto overscroll-contain px-2.5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5">
                {shown.length === 0 ? (
                  <p className="dash-muted px-2 py-10 text-center text-sm">
                    Nothing matches &ldquo;{query}&rdquo;.
                  </p>
                ) : (
                  <div className="space-y-3.5">
                    {shown.map((group) => (
                      <div key={group.label}>
                        <p
                          className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-[0.13em]"
                          style={{ color: "var(--dash-faint)" }}
                        >
                          {group.label}
                        </p>
                        <div className="space-y-0.5">
                          {group.items.map((item) => (
                            <NavRow
                              key={item.key}
                              item={item}
                              active={item.key === activeKey}
                              onClick={() => onSelect(item.key)}
                              large
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

/** Match on label, group name and hint, so "money" finds Transactions. */
function filterGroups(groups: AdminNavGroup[], query: string): AdminNavGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) =>
        `${i.label} ${g.label} ${i.hint ?? ""}`.toLowerCase().includes(q)
      ),
    }))
    .filter((g) => g.items.length > 0);
}
