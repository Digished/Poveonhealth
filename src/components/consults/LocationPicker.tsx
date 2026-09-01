"use client";

import { FuzzyCombo } from "@/components/ui/FuzzyCombo";
import { STATE_NAMES, lgasForState } from "@/lib/nigeria-locations";

/**
 * State and local government, picked from the list.
 *
 * Its own module because the state/LGA table and the fuzzy combo are about
 * 19KB, and this appears on one tab of one dashboard — no reason for everyone
 * checking a lab result to download it.
 */
export function LocationPicker({
  state,
  city,
  onStateChange,
  onCityChange,
  hint,
}: {
  state: string;
  city: string;
  onStateChange: (v: string) => void;
  onCityChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            State
          </label>
          <FuzzyCombo
            value={state}
            onChange={(v) => { onStateChange(v); onCityChange(""); }}
            options={STATE_NAMES}
            placeholder="Pick your state"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Local government
          </label>
          <FuzzyCombo
            value={city}
            onChange={onCityChange}
            options={lgasForState(state)}
            placeholder={state ? "Pick your area" : "Pick a state first"}
            disabled={!state}
            allowCustom
          />
        </div>
      </div>
      {hint && <p className="-mt-1 text-[11px] text-slate-400">{hint}</p>}
    </>
  );
}
