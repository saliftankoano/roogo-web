"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

/** One numbered chapter of the guide. Anchored for the table of contents. */
export function GuideSection({
  id,
  number,
  title,
  intro,
  children,
}: {
  id: string;
  number: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-32 space-y-6"
    >
      <header className="space-y-2">
        <p className="font-mono text-xs font-bold tabular-nums text-primary">
          {number}
        </p>
        <h2
          id={`${id}-title`}
          className="text-2xl font-extrabold tracking-[-0.01em] text-ink"
        >
          {title}
        </h2>
        <p className="max-w-prose text-[15px] leading-[1.45] text-ink-body">
          {intro}
        </p>
      </header>
      {children}
    </section>
  );
}

/** Sub-heading inside a section. */
export function GuideSubsection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">
          {title}
        </h3>
        {note && <p className="text-xs text-ink-muted">{note}</p>}
      </div>
      {children}
    </div>
  );
}

/** Copies a string and shows a check for a moment. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked: nothing to do, the text is visible anyway
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copié" : label}
      title={copied ? "Copié" : label}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8F867E] transition-colors duration-100 hover:bg-[#F4EEE6] hover:text-ink",
        copied && "text-success hover:text-success",
      )}
    >
      {copied ? (
        <CheckIcon size={14} weight="bold" />
      ) : (
        <CopyIcon size={14} weight="bold" />
      )}
    </button>
  );
}

/**
 * A rendered example with the Tailwind classes (or code) printed beside it.
 * The preview sits on white; the code strip sits below in mono.
 */
export function Specimen({
  label,
  code,
  children,
  className,
  previewClassName,
}: {
  label?: string;
  code?: string;
  children: React.ReactNode;
  className?: string;
  previewClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white",
        className,
      )}
    >
      {label && (
        <p className="border-b border-line-soft px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">
          {label}
        </p>
      )}
      <div className={cn("min-w-0 flex-1 p-4", previewClassName)}>
        {children}
      </div>
      {code && (
        <div className="flex items-start gap-2 border-t border-line-soft bg-paper px-4 py-2">
          <code className="min-w-0 flex-1 break-words font-mono text-[11px] leading-5 text-ink-body">
            {code}
          </code>
          <CopyButton value={code} label="Copier les classes" />
        </div>
      )}
    </div>
  );
}

/** Responsive grid for specimens. */
export function SpecimenGrid({
  children,
  columns = 2,
}: {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
}) {
  const cols = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-3 xl:grid-cols-4",
  }[columns];
  return <div className={cn("grid gap-4", cols)}>{children}</div>;
}

/** Inline mono chip for a class name or a value. */
export function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[#F4EEE6] px-1.5 py-0.5 font-mono text-[11px] text-ink-body">
      {children}
    </code>
  );
}
