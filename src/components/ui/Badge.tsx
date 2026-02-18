import clsx from "clsx";
import { RequestStatus } from "@/lib/types";

interface BadgeProps {
  status: RequestStatus;
  className?: string;
}

const config: Record<
  RequestStatus,
  { label: string; classes: string; dot: string }
> = {
  incoming: {
    label: "Incoming",
    classes: "bg-blue-100 text-blue-700 border border-blue-200",
    dot: "bg-blue-500",
  },
  seen: {
    label: "Patient Seen",
    classes: "bg-amber-100 text-amber-700 border border-amber-200",
    dot: "bg-amber-500",
  },
  done: {
    label: "Done",
    classes: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    dot: "bg-emerald-500",
  },
};

export function StatusBadge({ status, className }: BadgeProps) {
  const { label, classes, dot } = config[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
        classes,
        className
      )}
    >
      <span className={clsx("w-1.5 h-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

interface GenericBadgeProps {
  children: React.ReactNode;
  variant?: "blue" | "green" | "amber" | "red" | "slate";
  className?: string;
}

const variants: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 border border-blue-200",
  green: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  amber: "bg-amber-100 text-amber-700 border border-amber-200",
  red: "bg-red-100 text-red-700 border border-red-200",
  slate: "bg-slate-100 text-slate-600 border border-slate-200",
};

export function Badge({
  children,
  variant = "slate",
  className,
}: GenericBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
