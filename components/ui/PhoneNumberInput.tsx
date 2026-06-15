"use client";

import React from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import {
  PHONE_COUNTRIES,
  getPhoneCountry,
} from "@/lib/phone-countries";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface PhoneNumberInputProps {
  /** ISO 3166-1 alpha-2 country code, e.g. "BF", "FR" */
  iso: string;
  /** Raw national number digits as typed by the user */
  national: string;
  onIsoChange: (iso: string) => void;
  onNationalChange: (national: string) => void;
  label?: string;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  /**
   * Visual variant.
   * - "dark"    — dark bg (onboarding dark theme)
   * - "default" — light bg (profile, settings)
   */
  variant?: "dark" | "default";
  /** Optional icon rendered before the number input (e.g. WhatsApp logo) */
  prefixIcon?: React.ReactNode;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function PhoneNumberInput({
  iso,
  national,
  onIsoChange,
  onNationalChange,
  label,
  required = false,
  error,
  disabled = false,
  variant = "default",
  prefixIcon,
  className,
}: PhoneNumberInputProps) {
  const country = getPhoneCountry(iso);

  const handleNationalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^0-9]/g, "");
    onNationalChange(cleaned);
  };

  const isDark = variant === "dark";

  const wrapperCls = cn(
    "flex items-center rounded-xl border overflow-hidden transition-all",
    isDark
      ? "bg-[#1C1510] border-[#3D3027] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20"
      : "bg-white border-neutral-200 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
    error && (isDark ? "border-red-500/70" : "border-red-400"),
    disabled && "opacity-60 pointer-events-none",
    className,
  );

  const selectCls = cn(
    "h-12 pl-3 pr-2 shrink-0 text-sm font-bold cursor-pointer outline-none appearance-none",
    "border-r",
    isDark
      ? "bg-[#1C1510] border-r-[#3D3027] text-neutral-300"
      : "bg-neutral-50 border-r-neutral-200 text-neutral-700",
  );

  const inputCls = cn(
    "flex-1 h-12 px-3 outline-none bg-transparent text-base font-bold tracking-wider",
    isDark ? "text-white placeholder:text-neutral-600" : "text-neutral-900 placeholder:text-neutral-400",
  );

  return (
    <div className="space-y-1.5">
      {label !== undefined && (
        <label
          className={cn(
            "text-xs font-bold uppercase tracking-wider flex items-center gap-1.5",
            isDark ? "text-neutral-400" : "text-neutral-500",
          )}
        >
          {label}
          {required && <span className="text-primary">*</span>}
        </label>
      )}

      <div className={wrapperCls}>
        {/* Country select */}
        <div className="relative shrink-0">
          <select
            value={iso}
            onChange={(e) => onIsoChange(e.target.value)}
            disabled={disabled}
            className={selectCls}
            aria-label="Indicatif pays"
          >
            {PHONE_COUNTRIES.map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.flag} +{c.dialCode}
              </option>
            ))}
          </select>
        </div>

        {prefixIcon && (
          <div className="pl-2 shrink-0 flex items-center">{prefixIcon}</div>
        )}

        <input
          type="tel"
          inputMode="numeric"
          value={national}
          onChange={handleNationalChange}
          disabled={disabled}
          placeholder={`${country.nationalLength[0]}+ chiffres`}
          maxLength={15}
          className={inputCls}
        />
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs text-red-400 mt-1">
          <WarningCircleIcon size={13} weight="fill" />
          {error}
        </p>
      )}
    </div>
  );
}
