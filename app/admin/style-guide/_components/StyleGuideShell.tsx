"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type GuideTocEntry = { id: string; number: string; label: string };

/**
 * Two-column layout: sticky table of contents on desktop (with scroll-spy),
 * a horizontal jump list on phones, content on the right.
 */
export function StyleGuideShell({
  entries,
  children,
}: {
  entries: GuideTocEntry[];
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = React.useState(entries[0]?.id ?? "");

  React.useEffect(() => {
    const sections = entries
      .map((entry) => document.getElementById(entry.id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [entries]);

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
      <nav
        aria-label="Sommaire du guide"
        className="mb-8 -mx-6 overflow-x-auto px-6 lg:sticky lg:top-32 lg:mx-0 lg:mb-0 lg:self-start lg:overflow-visible lg:px-0"
      >
        <p className="mb-3 hidden text-xs font-black uppercase tracking-[0.2em] text-neutral-400 lg:block">
          Sommaire
        </p>
        <ol className="flex gap-1.5 lg:flex-col lg:gap-0.5">
          {entries.map((entry) => {
            const active = entry.id === activeId;
            return (
              <li key={entry.id} className="shrink-0">
                <a
                  href={`#${entry.id}`}
                  aria-current={active ? "location" : undefined}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-150 lg:rounded-xl",
                    active
                      ? "bg-white text-primary shadow-sm lg:bg-secondary/70 lg:shadow-none"
                      : "text-neutral-500 hover:bg-white hover:text-neutral-900 lg:hover:bg-neutral-100",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      active ? "text-primary" : "text-neutral-400",
                    )}
                  >
                    {entry.number}
                  </span>
                  {entry.label}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="min-w-0 space-y-20">{children}</div>
    </div>
  );
}
