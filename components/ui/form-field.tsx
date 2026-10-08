import * as React from "react";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

export interface FormFieldProps {
  /** Label text, rendered in the admin eyebrow style. */
  label?: React.ReactNode;
  /** The id of the control, so the label and messages are linked to it. */
  htmlFor?: string;
  required?: boolean;
  /** Optional help text under the control. */
  help?: React.ReactNode;
  /** Error message; when set it replaces the help text and turns red. */
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label + control + help/error wrapper. Pass the same `htmlFor` as the
 * control id; the component exposes `${id}-help` and `${id}-error` ids for
 * aria-describedby.
 */
export function FormField({
  label,
  htmlFor,
  required,
  help,
  error,
  className,
  children,
}: FormFieldProps) {
  const helpId = htmlFor ? `${htmlFor}-help` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500"
        >
          {label}
          {required && (
            <span className="text-primary" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-danger"
        >
          <WarningCircleIcon
            size={14}
            weight="fill"
            className="mt-px shrink-0"
            aria-hidden="true"
          />
          <span>{error}</span>
        </p>
      ) : help ? (
        <p id={helpId} className="text-xs text-neutral-500">
          {help}
        </p>
      ) : null}
    </div>
  );
}
