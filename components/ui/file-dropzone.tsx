"use client";

import * as React from "react";
import { CloudArrowUpIcon, XIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

export interface FileDropzoneProps {
  /** Called with the accepted files after a drop or a pick. */
  onFiles?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Headline inside the zone. */
  title?: string;
  /** Second line, for formats and size limits. */
  hint?: string;
  className?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/**
 * Drag-and-drop upload zone. Keeps a local list of picked files and lets the
 * user remove them one by one. Keyboard users open the picker with Enter.
 */
export function FileDropzone({
  onFiles,
  accept,
  multiple = true,
  disabled = false,
  invalid = false,
  title = "Glissez vos fichiers ici",
  hint = "ou cliquez pour parcourir",
  className,
}: FileDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [files, setFiles] = React.useState<File[]>([]);

  const accept_ = (incoming: FileList | null) => {
    if (!incoming) return;
    const list = Array.from(incoming);
    const next = multiple ? [...files, ...list] : list.slice(0, 1);
    setFiles(next);
    onFiles?.(next);
  };

  const remove = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    onFiles?.(next);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) accept_(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-[border-color,background-color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2",
          disabled
            ? "cursor-not-allowed border-line bg-[#F4EEE6] opacity-70"
            : "cursor-pointer border-[#D6CBBE] bg-white hover:border-primary/60 hover:bg-cream",
          dragging && "border-primary bg-cream",
          invalid && "border-danger",
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full bg-[#F7E4D3] text-primary transition-transform duration-150",
            dragging && "-translate-y-0.5",
          )}
        >
          <CloudArrowUpIcon size={22} weight="bold" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-xs text-ink-muted">{hint}</span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            accept_(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="divide-y divide-line-soft rounded-2xl border border-line bg-white">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm"
            >
              <span className="min-w-0 truncate font-medium text-ink">
                {file.name}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-ink-muted">
                  {formatSize(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`Retirer ${file.name}`}
                  className="rounded-full p-1 text-[#8F867E] transition-colors hover:bg-[#F4EEE6] hover:text-ink"
                >
                  <XIcon size={14} weight="bold" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
