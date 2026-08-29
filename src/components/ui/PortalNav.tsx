"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";

export type PortalNavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Count shown beside the label (hidden when 0). */
  badge?: number;
  /** Amber dot for "needs your attention" (incomplete profile, unset pricing). */
  alert?: boolean;
};

export type PortalNavSection = { label: string; items: PortalNavItem[] };

/**
 * Grouped portal navigation — a sticky sidebar from `lg` up, and a collapsible
 * grouped menu below it. Shared by the doctor and patient portals so both read
 * the same, and mirrors the lab dashboard's structure in a light palette.
 */
export function PortalNav({
  sections,
  activeKey,
  onSelect,
  open,
  onOpenChange,
}: {
  sections: PortalNavSection[];
  /** Key of the active item — for grouped entries, the parent's key. */
  activeKey: string;
  onSelect: (key: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const allItems = sections.flatMap((s) => s.items);
  const current = allItems.find((i) => i.key === activeKey) ?? allItems[0];

  const select = (key: string) => {
    onSelect(key);
    onOpenChange(false);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 shrink-0">
        <nav className="slim-scroll sticky top-[4.5rem] max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm backdrop-blur-sm">
          <div className="space-y-4">
            {sections.map((section) => (
              <div key={section.label}>
                <p className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavButton key={item.key} item={item} active={item.key === activeKey} onClick={() => select(item.key)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>
      </aside>

      {/* Mobile / tablet grouped menu */}
      {current && (
        <div className="lg:hidden mb-4">
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            className="flex w-full items-center gap-2.5 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition active:bg-white"
          >
            <current.icon className="h-4 w-4 text-medical-600" />
            <span className="flex-1 text-left">{current.label}</span>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div className="mt-1.5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
              {sections.map((section) => (
                <div key={section.label}>
                  <p className="bg-slate-50 px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {section.label}
                  </p>
                  {section.items.map((item) => {
                    const active = item.key === activeKey;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => select(item.key)}
                        className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm font-medium transition ${
                          active ? "bg-medical-50 text-medical-800" : "text-slate-600 active:bg-slate-50"
                        }`}
                      >
                        <item.icon className={`h-4 w-4 ${active ? "text-medical-600" : "text-slate-400"}`} />
                        <span className="flex-1 text-left">{item.label}</span>
                        <ItemMeta item={item} active={active} />
                        {active && <ChevronRight className="h-3.5 w-3.5 text-medical-400" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function NavButton({ item, active, onClick }: { item: PortalNavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition ${
        active
          ? "bg-medical-600 text-white shadow-sm shadow-medical-600/25"
          : "text-slate-600 hover:bg-white hover:text-slate-900"
      }`}
    >
      <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-slate-400"}`} />
      <span className="flex-1 truncate text-left">{item.label}</span>
      <ItemMeta item={item} active={active} />
    </button>
  );
}

function ItemMeta({ item, active }: { item: PortalNavItem; active: boolean }) {
  return (
    <>
      {!!item.badge && item.badge > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
      {item.alert && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Needs setup" />}
    </>
  );
}

/**
 * Sub-menu strip shown above the panel when the active nav entry has children.
 */
export function PortalSubNav({
  items,
  moreItems = [],
  moreLabel = "More",
  activeKey,
  onSelect,
}: {
  items: { key: string; label: string }[];
  /** Occasional views, folded into a dropdown so the strip stays short. */
  moreItems?: { key: string; label: string }[];
  moreLabel?: string;
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // A menu that stays open after you have clicked elsewhere is a menu in the way.
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreOpen]);

  if (items.length + moreItems.length < 2) return null;

  const activeMore = moreItems.find((i) => i.key === activeKey);

  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
      active
        ? "bg-medical-50 text-medical-800 ring-1 ring-inset ring-medical-200"
        : "text-slate-500 hover:bg-white hover:text-slate-800"
    }`;

  return (
    <div className="mb-4 -mx-4 overflow-x-auto no-scrollbar px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max items-center gap-1 border-b border-slate-200/80 pb-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            className={tabClass(item.key === activeKey)}
          >
            {item.label}
          </button>
        ))}

        {moreItems.length > 0 && (
          <div ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              className={`${tabClass(!!activeMore)} inline-flex items-center gap-1`}
            >
              {activeMore ? activeMore.label : moreLabel}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
            </button>

            {moreOpen && (
              <div className="absolute left-0 top-full z-40 mt-1 min-w-44 overflow-hidden rounded-xl border border-slate-100 bg-white py-1 shadow-lg">
                {moreItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      onSelect(item.key);
                      setMoreOpen(false);
                    }}
                    className={`block w-full px-3.5 py-2 text-left text-sm transition ${
                      item.key === activeKey
                        ? "bg-medical-50 font-semibold text-medical-800"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
