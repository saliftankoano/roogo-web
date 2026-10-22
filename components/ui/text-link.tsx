import * as React from "react";
import Link from "next/link";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

export type TextLinkVariant = "primary" | "muted" | "external";

export interface TextLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  variant?: TextLinkVariant;
}

export const textLinkVariants: Record<TextLinkVariant, string> = {
  primary:
    "font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:text-primary-hover hover:decoration-primary-hover",
  muted:
    "font-medium text-ink-muted underline decoration-[#D6CBBE] underline-offset-4 hover:text-ink hover:decoration-ink",
  external:
    "inline-flex items-center gap-1 font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:text-primary-hover hover:decoration-primary-hover",
};

/**
 * Text link. Internal hrefs use next/link; `external` opens a new tab with
 * the right rel and a small arrow so the user knows they will leave Roogo.
 */
export function TextLink({
  href,
  variant = "primary",
  className,
  children,
  ...props
}: TextLinkProps) {
  const classes = cn(
    "rounded-sm transition-colors duration-150",
    textLinkVariants[variant],
    className,
  );

  if (variant === "external") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        {...props}
      >
        {children}
        <ArrowSquareOutIcon size={14} weight="bold" aria-hidden="true" />
        <span className="sr-only"> (nouvel onglet)</span>
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}
