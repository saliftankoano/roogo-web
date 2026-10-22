"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface RangeInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Formats the current value for the optional read-out on the right. */
  formatValue?: (value: number) => string;
  /** Show the formatted value next to the track. */
  showValue?: boolean;
}

/** Native range with a primary-coloured thumb and a filled track. */
const RangeInput = React.forwardRef<HTMLInputElement, RangeInputProps>(
  (
    {
      className,
      formatValue,
      showValue = false,
      min = 0,
      max = 100,
      value,
      defaultValue,
      disabled,
      ...props
    },
    ref,
  ) => {
    const numericMin = Number(min);
    const numericMax = Number(max);
    const current = Number(value ?? defaultValue ?? numericMin);
    const percent =
      numericMax > numericMin
        ? ((current - numericMin) / (numericMax - numericMin)) * 100
        : 0;

    return (
      <div className={cn("flex items-center gap-3", className)}>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          style={{
            background: `linear-gradient(to right, var(--color-primary) ${percent}%, var(--color-roogo-line) ${percent}%)`,
          }}
          className={cn(
            "h-2 w-full cursor-pointer appearance-none rounded-full outline-none transition-opacity",
            "focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
            "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md",
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-md",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          {...props}
        />
        {showValue && (
          <output className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-body">
            {formatValue ? formatValue(current) : current}
          </output>
        )}
      </div>
    );
  },
);
RangeInput.displayName = "RangeInput";

export { RangeInput };
