"use client";

/**
 * A doctor's own bonus history.
 *
 * The pool pays for carrying members who need more, so the figure means little
 * on its own — each month shows the messages and members behind it, and the
 * share of the pool that produced the amount. A number with no working shown
 * is a number people argue about.
 *
 * A month an admin has not settled is labelled as a draft rather than shown as
 * money in hand: while it is a draft it can still be recomputed, and the worst
 * thing this panel could do is imply otherwise.
 */

import { useEffect, useState } from "react";
import { Info, Trophy } from "lucide-react";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
/** Stored to three decimals so a month reconciles; read to one. */
const pct = (n: number) => `${n < 0.1 && n > 0 ? n.toFixed(2) : n.toFixed(1)}%`;

type Row = {
  period: string;
  status: string;
  paid_at: string | null;
  pool_naira: number;
  share_percent: number;
  amount_naira: number;
  patients: number;
  messages: number;
};

function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}

export function BonusHistory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [paidTotal, setPaidTotal] = useState(0);
  const [current, setCurrent] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/doc-login/consults/bonus")
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) return;
        setRows(d.rows ?? []);
        setPaidTotal(d.paid_total ?? 0);
        setCurrent(d.current ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />;
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Trophy className="h-4 w-4 text-violet-500" />
            Stress bonus
          </h3>
          <p className="mt-0.5 max-w-md text-xs leading-relaxed text-slate-500">
            A share of a monthly pool, split by how much of the messaging you carried. Members who
            write more take more of your time, and this is what pays for it.
          </p>
        </div>
        {paidTotal > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Paid</p>
            <p className="text-xl font-extrabold text-violet-700">{naira(paidTotal)}</p>
          </div>
        )}
      </div>

      {current && current.status !== "paid" && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50/70 px-3.5 py-3">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-violet-500" />
          <p className="text-[11.5px] leading-relaxed text-violet-800">
            <span className="font-bold">{monthLabel(current.period)} so far: {naira(current.amount_naira)}</span>{" "}
            — {pct(current.share_percent)} of the pool, from {current.messages} message
            {current.messages === 1 ? "" : "s"} across {current.patients} member
            {current.patients === 1 ? "" : "s"}. Still moving until the month is settled.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-xs leading-relaxed text-slate-500">
          Nothing yet. Once a month is worked out, your share of the pool appears here with the
          messages and members behind it.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.period} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-700">{monthLabel(r.period)}</p>
                <p className="text-[11px] text-slate-400">
                  {pct(r.share_percent)} of {naira(r.pool_naira)} · {r.messages} message
                  {r.messages === 1 ? "" : "s"} from {r.patients} member{r.patients === 1 ? "" : "s"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-slate-800">{naira(r.amount_naira)}</p>
                <p
                  className={`text-[10.5px] font-semibold ${
                    r.status === "paid" ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {r.status === "paid" ? "Paid" : "Not settled yet"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
