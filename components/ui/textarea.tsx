import * as React from "react";

import { cn } from "@/lib/utils";
import { fieldClassName } from "@/components/ui/input";

export type TextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    invalid?: boolean;
  };

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(
        fieldClassName,
        "min-h-[2.75rem] resize-y px-3.5 py-2.5 leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
