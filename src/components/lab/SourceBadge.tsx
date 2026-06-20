"use client";

import clsx from "clsx";

export const SOURCE_META: Record<string, { label: string; cls: string }> = {
  poveon: { label: "Poveon", cls: "bg-medical-500/15 text-medical-300 border-medical-500/30" },
  walk_in: { label: "Walk-in", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  qr: { label: "QR", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
};

export const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "poveon", label: "Poveon" },
  { value: "walk_in", label: "Walk-in" },
  { value: "qr", label: "QR" },
];

/** Small pill showing how a client/request reached the lab. */
export function SourceBadge({ source, className }: { source: string | null | undefined; className?: string }) {
  const meta = SOURCE_META[source ?? "poveon"] ?? SOURCE_META.poveon;
  return (
    <span className={clsx("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", meta.cls, className)}>
      {meta.label}
    </span>
  );
}
