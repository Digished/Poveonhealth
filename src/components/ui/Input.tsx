"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  variant?: "light" | "dark";
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  variant?: "light" | "dark";
}

const inputBase =
  "w-full rounded-xl border px-4 py-2.5 text-sm transition-colors duration-200 focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed";

const inputLight = "bg-white/60 text-slate-800 placeholder-slate-400 focus:ring-medical-500 focus:border-medical-400";
const inputDark  = "bg-slate-800 text-white placeholder-slate-400 focus:ring-medical-500";

const inputNormalLight = "border-slate-200 hover:border-slate-300";
const inputNormalDark  = "border-slate-700 hover:border-slate-600";
const inputError = "border-red-400 focus:ring-red-400";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, variant = "light", ...props }, ref) => {
    const fieldId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    const isDark = variant === "dark";
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={fieldId}
            className={clsx("text-sm font-medium", isDark ? "text-slate-300" : "text-slate-700")}
          >
            {label}
            {props.required && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
            )}
          </label>
        )}
        <input
          ref={ref}
          id={fieldId}
          className={clsx(
            inputBase,
            isDark ? inputDark : inputLight,
            error ? inputError : (isDark ? inputNormalDark : inputNormalLight),
            className
          )}
          {...props}
        />
        {hint && !error && (
          <p className="text-xs text-slate-500">{hint}</p>
        )}
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, variant = "light", ...props }, ref) => {
    const fieldId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    const isDark = variant === "dark";
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={fieldId}
            className={clsx("text-sm font-medium", isDark ? "text-slate-300" : "text-slate-700")}
          >
            {label}
            {props.required && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
            )}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          rows={4}
          className={clsx(
            inputBase,
            isDark ? inputDark : inputLight,
            "resize-none",
            error ? inputError : (isDark ? inputNormalDark : inputNormalLight),
            className
          )}
          {...props}
        />
        {hint && !error && (
          <p className="text-xs text-slate-500">{hint}</p>
        )}
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  variant?: "light" | "dark";
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, id, variant = "light", ...props }, ref) => {
    const fieldId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    const isDark = variant === "dark";
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={fieldId}
            className={clsx("text-sm font-medium", isDark ? "text-slate-300" : "text-slate-700")}
          >
            {label}
            {props.required && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
            )}
          </label>
        )}
        <select
          ref={ref}
          id={fieldId}
          className={clsx(
            inputBase,
            "cursor-pointer appearance-none",
            isDark ? inputDark : inputLight,
            error ? inputError : (isDark ? inputNormalDark : inputNormalLight),
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {hint && !error && (
          <p className="text-xs text-slate-500">{hint}</p>
        )}
        {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";
