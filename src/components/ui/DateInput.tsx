"use client";

import { useEffect, useState } from "react";
import { isValid } from "date-fns";
import clsx from "clsx";

interface DateInputProps {
  value: string; // ISO YYYY-MM-DD, or ""
  onChange: (isoDate: string) => void;
  error?: string;
  placeholder?: string;
  /** Reject dates in the past — e.g. an expiry date. */
  futureOnly?: boolean;
  /** Reject dates in the future — e.g. a date of birth. */
  pastOnly?: boolean;
}

const inputBase =
  "w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-mono tracking-wider text-slate-800 placeholder-slate-400 transition-all duration-200 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-500 disabled:cursor-not-allowed disabled:opacity-60";

/** "YYYY-MM-DD" → "DDMMYYYY" */
function digitsFromIso(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}${m}${y}`;
}

/** Up to 8 digits → "DD / MM / YYYY" */
function formatDigits(digits: string): string {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
  return `${digits.slice(0, 2)} / ${digits.slice(2, 4)} / ${digits.slice(4)}`;
}

/** 8 digits → ISO, or null when the date is impossible or out of bounds. */
function toIso(digits: string, futureOnly: boolean, pastOnly: boolean): string | null {
  if (digits.length !== 8) return null;
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;

  const iso = `${year}-${month}-${day}`;
  const date = new Date(iso);
  // Catches impossible dates like 30 February.
  if (!isValid(date) || date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (pastOnly && date > today) return null;
  if (futureOnly && date < today) return null;
  return iso;
}

/** Whole months from today to `iso`; negative when it has already passed. */
function monthsAway(iso: string): number | null {
  const date = new Date(iso);
  if (!isValid(date)) return null;
  const now = new Date();
  return (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
}

/**
 * A dd/mm/yyyy date field, typed as digits.
 *
 * Same feel as DobInput, but the allowed range is a choice — DobInput hard-codes
 * "not in the future", which silently rejected every valid expiry date.
 */
export function DateInput({
  value, onChange, error, placeholder = "DD / MM / YYYY", futureOnly = false, pastOnly = false,
}: DateInputProps) {
  const [digits, setDigits] = useState(() => digitsFromIso(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDigits(digitsFromIso(value));
    setInvalid(false);
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    setDigits(raw);
    if (raw.length < 8) {
      setInvalid(false);
      onChange("");
      return;
    }
    const iso = toIso(raw, futureOnly, pastOnly);
    setInvalid(!iso);
    onChange(iso ?? "");
  }

  const months = value ? monthsAway(value) : null;
  const showError = !!error || invalid;
  const message =
    error ||
    (invalid
      ? futureOnly
        ? "That date has already passed"
        : pastOnly
        ? "That date is in the future"
        : "That date isn't valid"
      : undefined);

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={formatDigits(digits)}
        onChange={handleChange}
        maxLength={14}
        className={clsx(
          inputBase,
          showError ? "border-red-400 focus:ring-red-400" : "border-slate-200 hover:border-slate-300"
        )}
      />
      {message && <p className="text-xs font-medium text-red-600">{message}</p>}
      {!showError && value && futureOnly && months !== null && (
        <p className="text-xs font-medium text-medical-600">
          {months <= 0
            ? "Expires this month"
            : months === 1
            ? "Expires in a month"
            : `Expires in ${months} months`}
        </p>
      )}
    </div>
  );
}
