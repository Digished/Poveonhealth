"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { SPECIALTY_TREE, ALL_SPECIALTY_LABELS, type SpecialtyGroup } from "@/lib/specialties";

// =============================================================================
// SpecialtyTreePicker — grouped multi-select for the specialty hierarchy.
// Used by both the create and edit hospital forms in the admin Hospitals tab.
// Emits a flat string[] mixing parent and sub-specialty labels (API contract).
// =============================================================================

function matches(label: string, q: string) {
  return label.toLowerCase().includes(q);
}

export function SpecialtyTreePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const selected = useMemo(() => new Set(value), [value]);
  const q = query.trim().toLowerCase();

  function toggleLabel(label: string) {
    onChange(selected.has(label) ? value.filter((v) => v !== label) : [...value, label]);
  }

  function groupLabels(g: SpecialtyGroup) {
    return [g.name, ...g.subspecialties];
  }

  function isGroupFullySelected(g: SpecialtyGroup) {
    return groupLabels(g).every((l) => selected.has(l));
  }

  function toggleGroup(g: SpecialtyGroup) {
    const labels = groupLabels(g);
    if (isGroupFullySelected(g)) {
      const drop = new Set(labels);
      onChange(value.filter((v) => !drop.has(v)));
    } else {
      onChange([...value, ...labels.filter((l) => !selected.has(l))]);
    }
  }

  function selectAll() {
    onChange([...ALL_SPECIALTY_LABELS]);
  }

  function clearAll() {
    onChange([]);
  }

  const chipCls = (isSelected: boolean) =>
    `px-2 py-1 rounded-full text-[11px] font-medium border transition-all ${
      isSelected
        ? "bg-blue-600 border-blue-600 text-white"
        : "bg-white/5 border-white/10 text-slate-400 hover:border-white/25 hover:text-white"
    }`;

  return (
    <div>
      {/* Top bar: bulk actions + live count */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Specialties offered{" "}
          {value.length > 0 && <span className="text-blue-400 normal-case tracking-normal">({value.length} selected)</span>}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={selectAll}
            className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded-lg hover:bg-blue-500/10 transition"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={value.length === 0}
            className="text-[11px] font-semibold text-slate-400 hover:text-white disabled:opacity-40 disabled:hover:text-slate-400 px-2 py-0.5 rounded-lg hover:bg-white/10 transition"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search specialties…"
          className="w-full pl-7 pr-7 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition"
            aria-label="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Grouped tree */}
      <div className="max-h-64 overflow-y-auto pr-1 space-y-1.5">
        {SPECIALTY_TREE.map((g) => {
          const nameMatches = !q || matches(g.name, q);
          const matchingSubs = q ? g.subspecialties.filter((s) => matches(s, q)) : g.subspecialties;
          // Hide groups with no match at all while searching
          if (q && !nameMatches && matchingSubs.length === 0) return null;

          const visibleSubs = nameMatches ? g.subspecialties : matchingSubs;
          const hasSelection = groupLabels(g).some((l) => selected.has(l));
          // Searching always expands matching groups; otherwise a manual
          // toggle wins, falling back to auto-expand when anything is selected.
          const isExpanded =
            g.subspecialties.length > 0 && (q ? true : expanded[g.name] ?? hasSelection);
          const allOn = isGroupFullySelected(g);

          return (
            <div key={g.name} className="rounded-xl border border-white/8 bg-white/[0.03] px-2 py-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {g.subspecialties.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [g.name]: !isExpanded }))}
                    className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition shrink-0"
                    aria-label={isExpanded ? `Collapse ${g.name}` : `Expand ${g.name}`}
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                ) : (
                  <span className="w-5 shrink-0" />
                )}
                <button type="button" onClick={() => toggleLabel(g.name)} className={chipCls(selected.has(g.name))}>
                  {g.name}
                </button>
                {g.subspecialties.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(g)}
                    className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all shrink-0 ${
                      allOn
                        ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                        : "bg-white/5 border-white/10 text-slate-500 hover:text-white hover:border-white/25"
                    }`}
                    title={allOn ? `Deselect ${g.name} and all its sub-specialties` : `Select ${g.name} and all its sub-specialties`}
                  >
                    {allOn ? "All ✓" : "All"}
                  </button>
                )}
              </div>
              {isExpanded && visibleSubs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5 pl-6">
                  {visibleSubs.map((s) => (
                    <button key={s} type="button" onClick={() => toggleLabel(s)} className={chipCls(selected.has(s))}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {q &&
          SPECIALTY_TREE.every(
            (g) => !matches(g.name, q) && g.subspecialties.every((s) => !matches(s, q))
          ) && <p className="text-xs text-slate-500 py-3 text-center">No specialties match &ldquo;{query}&rdquo;</p>}
      </div>
    </div>
  );
}
