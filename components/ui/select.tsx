import * as React from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/input";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

/** Native select with the shared field surface and a caret that never covers text. */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        aria-invalid={invalid || props["aria-invalid"] || undefined}
        className={cn(
          fieldClassName,
          "h-11 appearance-none pl-3.5 pr-10 font-medium cursor-pointer disabled:cursor-not-allowed",
        )}
        {...props}
      >
        {children}
      </select>
      <CaretDownIcon
        size={16}
        weight="bold"
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
      />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
