"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";
import { Input } from "@/components/ui/Input";

interface BankAccountInputProps {
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  onBankChange: (name: string, code: string) => void;
  onAccountNumberChange: (value: string) => void;
  onAccountNameChange: (value: string) => void;
  onVerifiedChange?: (verified: boolean) => void;
  bankError?: string;
  accountNumberError?: string;
  accountNameError?: string;
  /** When true, removes the required constraint so the section can be left blank */
  optional?: boolean;
}

export function BankAccountInput({
  bankName,
  bankCode,
  accountNumber,
  accountName,
  onBankChange,
  onAccountNumberChange,
  onAccountNameChange,
  onVerifiedChange,
  bankError,
  accountNumberError,
  accountNameError,
  optional = false,
}: BankAccountInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [verified, setVerified] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = NIGERIAN_BANKS.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  // Open dropdown → focus search after paint
  useEffect(() => {
    if (dropdownOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [dropdownOpen]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Auto-verify when account number hits 10 digits and a bank is selected
  useEffect(() => {
    if (accountNumber.length === 10 && bankCode) {
      void verify(accountNumber, bankCode);
    } else {
      // Reset verified state when inputs change
      if (verified) {
        setVerified(false);
        onVerifiedChange?.(false);
        onAccountNameChange("");
      }
      setVerifyError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountNumber, bankCode]);

  async function verify(accNum: string, code: string) {
    setVerifying(true);
    setVerifyError("");
    try {
      const res = await fetch("/api/doc-profile/verify-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_number: accNum, bank_code: code }),
      });
      const data = await res.json();
      if (data.success) {
        onAccountNameChange(data.account_name);
        setVerified(true);
        onVerifiedChange?.(true);
      } else {
        setVerifyError(data.error ?? "Verification failed. Please try again.");
        onAccountNameChange("");
        setVerified(false);
        onVerifiedChange?.(false);
      }
    } catch {
      setVerifyError("Network error. Please try again.");
      setVerified(false);
    } finally {
      setVerifying(false);
    }
  }

  function handleSelectBank(name: string, code: string) {
    onBankChange(name, code);
    setDropdownOpen(false);
    // Re-verify if account number is already 10 digits
    if (accountNumber.length === 10) {
      void verify(accountNumber, code);
    }
  }

  function clearBank() {
    onBankChange("", "");
    setVerified(false);
    onAccountNameChange("");
    setVerifyError("");
  }

  const inputBase =
    "w-full rounded-xl border bg-white/60 backdrop-blur-sm px-4 py-2.5 text-slate-800 placeholder-slate-400 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="space-y-3">
      {/* Bank selector */}
      <div className="flex flex-col gap-1" ref={containerRef}>
        <label className="text-sm font-medium text-slate-700">
          Bank Name
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className={clsx(
              inputBase,
              "flex items-center justify-between text-left",
              bankError ? "border-red-400 focus:ring-red-400" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <span className={bankName ? "text-slate-800" : "text-slate-400"}>
              {bankName || "Select your bank"}
            </span>
            <span className="flex items-center gap-1 shrink-0 ml-2">
              {bankName && (
                <span
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); clearBank(); }}
                  onKeyDown={(e) => { if (e.key === "Enter") clearBank(); }}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                  aria-label="Clear bank"
                >
                  <X className="w-3.5 h-3.5" />
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </span>
          </button>

          {dropdownOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-slate-100">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setDropdownOpen(false);
                    if (e.key === "Enter" && filtered.length === 1) {
                      handleSelectBank(filtered[0].name, filtered[0].code);
                    }
                  }}
                  placeholder="Search banks…"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400"
                />
              </div>
              {/* List */}
              <ul className="max-h-52 overflow-y-auto">
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-slate-400 text-center">No banks found</li>
                ) : (
                  filtered.map((b) => (
                    <li key={b.code}>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleSelectBank(b.name, b.code); }}
                        className={clsx(
                          "w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors hover:bg-slate-50",
                          bankCode === b.code ? "text-medical-700 font-medium bg-medical-50" : "text-slate-700"
                        )}
                      >
                        {b.name}
                        {bankCode === b.code && <Check className="w-4 h-4 text-medical-600 shrink-0" />}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
        {bankError && <p className="text-xs text-red-600 font-medium">{bankError}</p>}
      </div>

      {/* Account number */}
      <div className="relative">
        <Input
          label="Account Number"
          required={!optional}
          placeholder="10-digit NUBAN account number"
          value={accountNumber}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, 10);
            onAccountNumberChange(val);
          }}
          inputMode="numeric"
          maxLength={10}
          error={accountNumberError}
        />
        {/* Verification indicator inside input */}
        {accountNumber.length === 10 && bankCode && (
          <div className="absolute right-3 top-[34px]">
            {verifying ? (
              <Loader2 className="w-4 h-4 text-medical-500 animate-spin" />
            ) : verified ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : null}
          </div>
        )}
      </div>
      {verifyError && (
        <p className="text-xs text-red-600 font-medium -mt-2">{verifyError}</p>
      )}

      {/* Account name — auto-filled and locked when verified */}
      {verified ? (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">
            Account Name
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
          </label>
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 border-emerald-300 bg-emerald-50">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold text-emerald-800 flex-1">{accountName}</span>
            <span className="text-xs text-emerald-600 font-medium whitespace-nowrap">Verified</span>
          </div>
          <p className="text-xs text-slate-500">Confirmed via NIBSS — this is the account name on record.</p>
        </div>
      ) : (
        <Input
          label="Account Name"
          required={!optional}
          placeholder="Name as it appears on bank account"
          value={accountName}
          onChange={(e) => onAccountNameChange(e.target.value)}
          error={accountNameError}
          hint={
            !bankCode && accountNumber.length === 10
              ? "Select a bank above to auto-verify"
              : bankCode && accountNumber.length < 10
              ? "Enter your 10-digit account number to auto-verify"
              : undefined
          }
        />
      )}
    </div>
  );
}
