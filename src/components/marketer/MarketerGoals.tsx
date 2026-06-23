"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { Target, Flame, Trophy, Check, Pencil } from "lucide-react";

interface Goals { weekly_target: number | null; total_doctors: number; activeThisWeek: number; activatedThisWeek: number; streak: number }
interface LeaderRow { rank: number; name: string; is_me: boolean; revenue: number; active_doctors: number }
interface Leaderboard { my_rank: number | null; total: number; top: LeaderRow[] }

const fmtNaira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export function MarketerGoals() {
  const [goals, setGoals] = useState<Goals | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState("");

  const load = useCallback(async () => {
    const [g, b] = await Promise.all([
      fetch("/api/scale/goals").then((r) => r.json()),
      fetch("/api/scale/leaderboard").then((r) => r.json()),
    ]);
    if (g.success) { setGoals(g); setTarget(g.weekly_target?.toString() ?? ""); }
    if (b.success) setBoard(b);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveTarget() {
    const res = await fetch("/api/scale/goals", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekly_target: target }),
    });
    if (res.ok) { toast.success("Goal saved"); setEditing(false); load(); }
    else toast.error("Failed to save");
  }

  if (!goals) return <div className="space-y-3 animate-pulse">{[1,2].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-slate-100" />)}</div>;

  const target_n = goals.weekly_target ?? 0;
  const pct = target_n > 0 ? Math.min(100, Math.round((goals.activeThisWeek / target_n) * 100)) : 0;

  return (
    <div className="space-y-4">
      {/* Weekly goal */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800"><Target className="w-4 h-4 text-emerald-600" /> Weekly goal</div>
          <button onClick={() => setEditing((v) => !v)} className="text-slate-400 hover:text-slate-600"><Pencil className="w-3.5 h-3.5" /></button>
        </div>

        {editing ? (
          <div className="flex items-center gap-2">
            <input type="number" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 5"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <button onClick={saveTarget} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-2 rounded-xl flex items-center gap-1"><Check className="w-4 h-4" /> Save</button>
          </div>
        ) : goals.weekly_target == null ? (
          <button onClick={() => setEditing(true)} className="text-sm text-emerald-700 font-semibold">Set a weekly target →</button>
        ) : (
          <>
            <div className="flex items-end justify-between mb-1.5">
              <p className="text-2xl font-bold text-slate-800">{goals.activeThisWeek}<span className="text-base text-slate-400"> / {target_n}</span></p>
              <p className="text-xs text-slate-400">doctors active this week</p>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
      </div>

      {/* Streak + activations */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
          <Flame className="w-5 h-5 text-orange-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-800">{goals.streak}</p>
          <p className="text-[11px] text-slate-400">week streak</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-center">
          <Check className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-slate-800">{goals.activatedThisWeek}</p>
          <p className="text-[11px] text-slate-400">activated this week</p>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800"><Trophy className="w-4 h-4 text-amber-500" /> This month&apos;s leaderboard</div>
          {board?.my_rank && <span className="text-xs text-slate-400">You&apos;re #{board.my_rank} of {board.total}</span>}
        </div>
        {!board || board.top.length === 0 ? (
          <p className="text-xs text-slate-400">No activity yet this month.</p>
        ) : (
          <div className="space-y-1.5">
            {board.top.map((r) => (
              <div key={r.rank} className={`flex items-center gap-3 px-2.5 py-2 rounded-xl ${r.is_me ? "bg-emerald-50 border border-emerald-100" : ""}`}>
                <span className={`w-6 text-center text-sm font-bold ${r.rank <= 3 ? "text-amber-500" : "text-slate-400"}`}>{r.rank}</span>
                <span className="flex-1 text-sm font-medium text-slate-700 truncate">{r.name}</span>
                <span className="text-xs text-slate-500">{r.active_doctors} active</span>
                <span className="text-sm font-semibold text-slate-800">{fmtNaira(r.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
