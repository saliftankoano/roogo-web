import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Marks the control as invalid (red border) and sets aria-invalid. */
  invalid?: boolean;
};

/**
 * Shared field surface used by Input, Select and Textarea so every control
 * reads the same as the team pages (2026-10-22): rounded-2xl, warm line,
 * 15 px text, terracotta focus, red on error.
 */
export const fieldClassName =
  "w-full rounded-2xl border border-line bg-white text-[15px] text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[#8F867E] hover:border-[#D6CBBE] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 read-only:bg-paper read-only:text-ink-body read-only:focus:ring-0 read-only:focus:border-line disabled:cursor-not-allowed disabled:bg-[#F4EEE6] disabled:text-ink-muted disabled:opacity-70 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, ...props }, ref) => {
    return (
      <input
        type={type}
        aria-invalid={invalid || props["aria-invalid"] || undefined}
        className={cn(
          fieldClassName,
          "h-11 px-3.5 file:mr-3 file:h-full file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-primary",
          type === "search" && "[&::-webkit-search-cancel-button]:appearance-none",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
