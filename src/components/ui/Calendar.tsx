"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, format, isSameDay, isSameMonth, isToday,
} from "date-fns";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Lightweight month calendar styled for the dark dashboard. Used both as a
 * date/time picker (`withTime`) for scheduling and as a schedule overview where
 * each day shows a count badge (`markers`) and clicking a day surfaces that
 * day's items via `onSelect`.
 */
export function Calendar({
  value,
  onSelect,
  withTime = false,
  markers,
  onVisibleMonthChange,
}: {
  value: Date | null;
  onSelect: (date: Date) => void;
  /** Show a time picker under the grid and emit a full datetime on selection. */
  withTime?: boolean;
  /** Map of yyyy-MM-dd → count, rendered as a badge on the day. */
  markers?: Map<string, number>;
  /** Fires when the visible month changes (for loading markers in a range). */
  onVisibleMonthChange?: (monthStart: Date, monthEnd: Date) => void;
}) {
  const [cursor, setCursor] = useState<Date>(value ?? new Date());
  const [time, setTime] = useState<string>(value ? format(value, "HH:mm") : "09:00");

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor));
    const gridEnd = endOfWeek(endOfMonth(cursor));
    const out: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d);
    return out;
  }, [cursor]);

  function shiftMonth(delta: number) {
    const next = addMonths(cursor, delta);
    setCursor(next);
    onVisibleMonthChange?.(startOfMonth(next), endOfMonth(next));
  }

  function pick(day: Date) {
    if (withTime) {
      const [h, m] = time.split(":").map(Number);
      const dt = new Date(day);
      dt.setHours(h || 0, m || 0, 0, 0);
      onSelect(dt);
    } else {
      onSelect(day);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-white">{format(cursor, "MMMM yyyy")}</p>
        <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 px-1 pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = isSameMonth(day, cursor);
          const selected = value ? isSameDay(day, value) : false;
          const count = markers?.get(dayKey(day)) ?? 0;
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => pick(day)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition ${
                selected
                  ? "bg-medical-600 font-semibold text-white"
                  : inMonth
                    ? "text-slate-200 hover:bg-white/10"
                    : "text-slate-600 hover:bg-white/5"
              } ${isToday(day) && !selected ? "ring-1 ring-medical-400/50" : ""}`}
            >
              {format(day, "d")}
              {count > 0 && (
                <span className={`absolute bottom-1 inline-flex h-1.5 min-w-[0.375rem] items-center justify-center rounded-full px-1 text-[8px] font-bold ${selected ? "bg-white text-medical-700" : "bg-medical-500 text-white"}`}>
                  {count > 1 ? count : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {withTime && (
        <div className="mt-3 flex items-center gap-2 border-t border-white/10 px-1 pt-3">
          <label className="text-xs font-medium text-slate-400">Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              if (value) {
                const [h, m] = e.target.value.split(":").map(Number);
                const dt = new Date(value);
                dt.setHours(h || 0, m || 0, 0, 0);
                onSelect(dt);
              }
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white focus:border-medical-400 focus:outline-none [color-scheme:dark]"
          />
        </div>
      )}
    </div>
  );
}
