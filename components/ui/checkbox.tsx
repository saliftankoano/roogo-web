"use client";

import * as React from "react";
import { CheckIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Optional label rendered to the right, clickable. */
  label?: React.ReactNode;
  /** Secondary line under the label. */
  description?: React.ReactNode;
  invalid?: boolean;
}

/**
 * Native checkbox with a custom box. Keyboard, forms and screen readers all
 * see the real input; only the visual is replaced.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
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
            type="checkbox"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            className="peer absolute inset-0 h-full w-full cursor-[inherit] appearance-none rounded-md border border-neutral-300 bg-white transition-colors duration-150 group-hover:border-neutral-400 checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 aria-[invalid=true]:border-danger"
            {...props}
          />
          <CheckIcon
            size={14}
            weight="bold"
            aria-hidden="true"
            className="pointer-events-none relative text-white opacity-0 transition-opacity duration-100 peer-checked:opacity-100"
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
Checkbox.displayName = "Checkbox";

export { Checkbox };
