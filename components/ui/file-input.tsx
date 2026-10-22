"use client";

import * as React from "react";
import { PaperclipIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

export interface FileInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Text on the button part. */
  buttonLabel?: string;
  /** Text when nothing is selected. */
  placeholder?: string;
  invalid?: boolean;
}

/**
 * Native file input dressed as a field: a "Choisir" button plus the chosen
 * file name. The real input stays focusable and form-friendly.
 */
const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  (
    {
      className,
      buttonLabel = "Choisir un fichier",
      placeholder = "Aucun fichier sélectionné",
      invalid,
      disabled,
      onChange,
      ...props
    },
    ref,
  ) => {
    const [fileNames, setFileNames] = React.useState<string[]>([]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      setFileNames(files.map((file) => file.name));
      onChange?.(event);
    };

    return (
      <label
        className={cn(
          "flex h-11 w-full items-center overflow-hidden rounded-2xl border border-line bg-white text-sm transition-[border-color,box-shadow] duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
          !disabled && "cursor-pointer hover:border-[#D6CBBE]",
          disabled && "cursor-not-allowed bg-[#F4EEE6] opacity-70",
          invalid && "border-danger focus-within:ring-danger/20",
          className,
        )}
      >
        <span className="flex h-full shrink-0 items-center gap-2 border-r border-line bg-paper px-3.5 font-semibold text-ink-body">
          <PaperclipIcon size={16} weight="bold" aria-hidden="true" />
          {buttonLabel}
        </span>
        <span
          className={cn(
            "truncate px-3.5",
            fileNames.length ? "text-ink" : "text-[#8F867E]",
          )}
        >
          {fileNames.length ? fileNames.join(", ") : placeholder}
        </span>
        <input
          ref={ref}
          type="file"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={handleChange}
          className="sr-only"
          {...props}
        />
      </label>
    );
  },
);
FileInput.displayName = "FileInput";

export { FileInput };
