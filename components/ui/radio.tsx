"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  invalid?: boolean;
}

/** Native radio with a custom dot. Group several with the same `name`. */
const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, description, invalid, id, disabled, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <label
        htmlFor={inputId}
        className={cn(
          "group inline-flex items-start gap-3",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          className,
        )}
      >
        <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={inputId}
            type="radio"
            disabled={disabled}
            data-invalid={invalid || undefined}
            className="peer absolute inset-0 h-full w-full cursor-[inherit] appearance-none rounded-full border border-neutral-300 bg-white transition-colors duration-150 group-hover:border-neutral-400 checked:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 data-[invalid=true]:border-danger"
            {...props}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none relative h-2.5 w-2.5 scale-0 rounded-full bg-primary transition-transform duration-100 peer-checked:scale-100"
          />
        </span>
        {(label || description) && (
          <span className="flex flex-col gap-0.5">
            {label && (
              <span className="text-sm font-medium leading-5 text-neutral-900">
                {label}
              </span>
            )}
            {description && (
              <span className="text-xs text-neutral-500">{description}</span>
            )}
          </span>
        )}
      </label>
    );
  },
);
Radio.displayName = "Radio";

export { Radio };
