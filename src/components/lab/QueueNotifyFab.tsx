"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";

interface FabEntry {
  id: string;
  code: string;
  patient_name: string | null;
  is_paid: boolean;
  attended_at: string | null;
  queue_confirmed_at: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  return `${Math.floor(hours / 24)} day(s) ago`;
}

/**
 * Global floating queue notification — visible on every dashboard tab. Counts
 * new, still-unactioned queue registrations; the badge clears when entries
 * are addressed directly (paid / attended — they leave the waiting list) or
 * indirectly (the lab opens the Queue tab, or "Mark all seen").
 */
export function QueueNotifyFab({
  labId,
  active,
  onOpenQueue,
}: {
  labId: string;
  /** True while the Queue tab is on screen — viewing the queue acknowledges. */
  active: boolean;
  onOpenQueue: () => void;
}) {
  const [waiting, setWaiting] = useState<FabEntry[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(() => Date.now());
  const [open, setOpen] = useState(false);

  const ackKey = `poveon_queue_lastseen_${labId}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(ackKey);
      if (stored) setLastSeen(Number(stored));
      else localStorage.setItem(ackKey, String(Date.now()));
    } catch { /* ignore */ }
  }, [ackKey]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/lab/queue", { cache: "no-store" });
      const d = await res.json();
      if (d.success) setWaiting(d.waiting ?? []);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => clearInterval(id);
  }, [load]);

  const ack = useCallback(() => {
    const now = Date.now();
    setLastSeen(now);
    setOpen(false);
    try { localStorage.setItem(ackKey, String(now)); } catch { /* ignore */ }
  }, [ackKey]);

  // Opening the Queue tab counts as seeing everything currently there.
  useEffect(() => { if (active) ack(); }, [active, ack]);

  // Unaddressed = still waiting (not paid / attended) AND newer than the last
  // acknowledgement. Anything the lab acts on drops off automatically.
  const fresh = useMemo(
    () => waiting.filter((r) => !r.is_paid && !r.attended_at && new Date(r.queue_confirmed_at ?? r.created_at).getTime() > lastSeen),
    [waiting, lastSeen]
  );

  if (active || fresh.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9998] flex flex-col items-end">
      {open && (
        <div className="mb-3 max-h-80 w-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-800 p-2 shadow-2xl">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-xs font-semibold text-slate-300">New queue registrations</p>
            <button onClick={ack} className="text-[11px] text-medical-300 hover:text-white">Mark all seen</button>
          </div>
          {fresh.map((r) => (
            <button
              key={r.id}
              onClick={() => { setOpen(false); onOpenQueue(); }}
              className="block w-full rounded-lg px-2 py-2 text-left hover:bg-white/10"
            >
              <span className="block truncate text-sm text-white">{r.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-400">· {r.code}</span></span>
              <span className="block text-[10px] text-slate-400">Joined the queue {timeAgo(r.queue_confirmed_at ?? r.created_at)}</span>
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-medical-600 text-white shadow-xl transition hover:bg-medical-700"
        title="New queue registrations"
      >
        <Bell className="h-6 w-6" />
        <span className="absolute -right-1 -top-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">{fresh.length}</span>
      </button>
    </div>
  );
}
