"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Calendar } from "@/components/ui/Calendar";

interface ScheduledRequest {
  id: string; code: string; patient_name: string | null; patient_phone: string | null;
  tests: string; scheduled_at: string | null; current_stage: string | null; status: string; source: string;
}

const dayKey = (iso: string) => format(new Date(iso), "yyyy-MM-dd");

/**
 * Month calendar of booked appointments (radiology/imaging). Each day shows a
 * count; selecting a day lists that day's bookings with the investigation type
 * and time. `onSelectRequest` opens the booked client's details.
 */
export function ScheduleCalendar({ onSelectRequest }: { onSelectRequest?: (id: string) => void }) {
  const [scheduled, setScheduled] = useState<ScheduledRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  const load = useCallback(async (monthStart: Date, monthEnd: Date) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: monthStart.toISOString(), to: monthEnd.toISOString() });
      const res = await fetch(`/api/lab/schedule?${params}`, { cache: "no-store" });
      const data = await res.json();
      setScheduled(data.requests ?? []);
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    load(startOfMonth(now), endOfMonth(now));
  }, [load]);

  const markers = new Map<string, number>();
  for (const s of scheduled) if (s.scheduled_at) markers.set(dayKey(s.scheduled_at), (markers.get(dayKey(s.scheduled_at)) ?? 0) + 1);
  const dayItems = selectedDay
    ? scheduled.filter((s) => s.scheduled_at && dayKey(s.scheduled_at) === format(selectedDay, "yyyy-MM-dd"))
    : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <Calendar value={selectedDay} onSelect={setSelectedDay} markers={markers} onVisibleMonthChange={(s, e) => load(s, e)} />
        {loading && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Loading schedule…</p>}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-white">
          {selectedDay ? format(selectedDay, "EEEE, MMMM d") : "Pick a day"}
          <span className="ml-2 text-xs font-normal text-slate-400">{dayItems.length} booked</span>
        </p>
        {dayItems.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 py-12 text-center text-sm text-slate-400">Nothing scheduled this day.</div>
        ) : (
          <div className="space-y-2">
            {dayItems.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelectRequest?.(s.id)}
                className="block w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:bg-white/10"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-white">{s.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-400">· {s.code}</span></p>
                  <span className="shrink-0 text-xs font-medium text-medical-300">{s.scheduled_at ? format(new Date(s.scheduled_at), "h:mm a") : ""}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-400">{s.tests}</p>
                {s.patient_phone && <p className="mt-0.5 text-[11px] text-slate-500">{s.patient_phone}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
