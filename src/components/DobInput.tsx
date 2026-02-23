"use client";

import { useState, useEffect } from "react";
import { differenceInYears, isValid } from "date-fns";
import clsx from "clsx";

interface DobInputProps {
  value: string; // ISO YYYY-MM-DD or ""
  onChange: (isoDate: string) => void;
  error?: string;
  required?: boolean;
}

const inputBase =
  "w-full rounded-xl border bg-white/60 backdrop-blur-sm px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 disabled:opacity-60 disabled:cursor-not-allowed font-mono tracking-wider";

/** Extract raw digit string from an ISO date (YYYY-MM-DD → "DDMMYYYY") */
function digitsFromIso(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}${m}${y}`;
}

/** Format up-to-8 digits as "DD / MM / YYYY" */
function formatDigits(digits: string): string {
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
  return `${digits.slice(0, 2)} / ${digits.slice(2, 4)} / ${digits.slice(4)}`;
}

/** Convert 8 digits to ISO string, returning null if the date is invalid or in the future */
function toIso(digits: string): string | null {
  if (digits.length !== 8) return null;
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 9999) return null;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(iso);
  // Catch impossible dates like Feb 30
  if (
    !isValid(date) ||
    date.getFullYear() !== y ||
    date.getMonth() + 1 !== m ||
    date.getDate() !== d
  ) return null;
  // Must not be in the future
  if (date > new Date()) return null;
  return iso;
}

export function DobInput({ value, onChange, error, required }: DobInputProps) {
  const [digits, setDigits] = useState(() => digitsFromIso(value));
  const [invalidDate, setInvalidDate] = useState(false);

  // Sync when parent resets the field (e.g. form clear)
  useEffect(() => {
    if (!value) {
      setDigits("");
      setInvalidDate(false);
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    setDigits(raw);
    if (raw.length === 8) {
      const iso = toIso(raw);
      if (iso) {
        setInvalidDate(false);
        onChange(iso);
      } else {
        setInvalidDate(true);
        onChange("");
      }
    } else {
      setInvalidDate(false);
      onChange("");
    }
  }

  const age = (() => {
    if (!value) return null;
    const date = new Date(value);
    if (!isValid(date)) return null;
    return differenceInYears(new Date(), date);
  })();

  const showError = error || invalidDate;
  const errorMessage = error || (invalidDate ? "Invalid date" : undefined);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">
        Date of Birth{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        inputMode="numeric"
        placeholder="DD / MM / YYYY"
        value={formatDigits(digits)}
        onChange={handleChange}
        maxLength={14}
        autoComplete="bday"
        className={clsx(
          inputBase,
          showError
            ? "border-red-400 focus:ring-red-400"
            : "border-slate-200 hover:border-slate-300"
        )}
      />
      {age !== null && !showError && (
        <p className="text-xs text-medical-600 font-medium">
          {age} year{age !== 1 ? "s" : ""} old
        </p>
      )}
      {errorMessage && (
        <p className="text-xs text-red-600 font-medium">{errorMessage}</p>
      )}
    </div>
  );
}
