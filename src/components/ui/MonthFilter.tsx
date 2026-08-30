"use client";

/**
 * A month picker built from the data in hand.
 *
 * Deliberately not a date range: people looking back over a care plan think in
 * months ("what did March look like"), and a range picker on a phone is three
 * taps and a mistake. Months with nothing in them are not offered.
 */

export type MonthOption = { month: string; count: number };

/** "2026-03" → "March", or "March 2027" when it is not the current year. */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    ...(y === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

/** The "2026-03" key for a date, or null when there isn't one. */
export function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Count how many things fall in each month, newest first. */
export function monthsFrom(dates: (string | null | undefined)[]): MonthOption[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = monthKey(d);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, count]) => ({ month, count }));
}

export function MonthFilter({
  months,
  value,
  onChange,
  allLabel = "All",
  allCount,
  className = "",
}: {
  months: MonthOption[];
  value: string;
  onChange: (month: string) => void;
  allLabel?: string;
  allCount?: number;
  className?: string;
}) {
  // One month is no choice at all.
  if (months.length < 2) return null;

  return (
    <div className={`-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0 ${className}`}>
      <div className="flex min-w-max gap-1.5">
        <button
          onClick={() => onChange("")}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            value === ""
              ? "bg-medical-600 text-white"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300"
          }`}
        >
          {allLabel}
          {allCount != null ? ` (${allCount})` : ""}
        </button>
        {months.map((m) => (
          <button
            key={m.month}
            onClick={() => onChange(value === m.month ? "" : m.month)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              value === m.month
                ? "bg-medical-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300"
            }`}
          >
            {monthLabel(m.month)} ({m.count})
          </button>
        ))}
      </div>
    </div>
  );
}
