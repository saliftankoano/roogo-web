"use client";

import Image, { type ImageProps } from "next/image";
import { type ComponentPropsWithoutRef, type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type MarketingImageProps = Omit<ImageProps, "src" | "alt"> & {
  alt: string;
  fallbackSrc: string;
  src: string;
};

export function MarketingImage({
  src,
  fallbackSrc,
  alt,
  onError,
  unoptimized,
  ...props
}: MarketingImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

  return (
    <Image
      {...props}
      alt={alt}
      src={currentSrc}
      unoptimized={unoptimized}
      onError={(event) => {
        if (currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc);
        }
        onError?.(event);
      }}
    />
  );
}

export function Kicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  kicker,
  title,
  description,
  align = "left",
  className,
  dark = false,
}: {
  align?: "left" | "center";
  className?: string;
  dark?: boolean;
  description: string;
  kicker: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <Kicker className={dark ? "border-white/15 bg-white/10 text-white/80" : ""}>
        {kicker}
      </Kicker>
      <h2
        className={cn(
          "mt-5 text-3xl font-black leading-tight tracking-tight md:text-5xl",
          dark ? "text-white" : "text-neutral-950",
        )}
      >
        {title}
      </h2>
      <p
        className={cn(
          "mt-5 text-base leading-8 md:text-lg",
          dark ? "text-white/70" : "text-neutral-600",
        )}
      >
        {description}
      </p>
    </div>
  );
}

export function DarkSection({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      {...props}
      className={cn(
        "relative overflow-hidden bg-[#17120f] py-24 text-white md:py-32",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(201,106,46,0.25),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.06),transparent_42%)]" />
      <div className="relative mx-auto w-full max-w-7xl px-6">{children}</div>
    </section>
  );
}

export function EditorialSection({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      {...props}
      className={cn("bg-[#f5efe6] py-24 md:py-32", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6">{children}</div>
    </section>
  );
}

export function ProofStat({
  label,
  value,
  dark = false,
}: {
  dark?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-l pl-4",
        dark ? "border-white/15" : "border-neutral-200",
      )}
    >
      <div
        className={cn(
          "text-2xl font-black tracking-tight md:text-3xl",
          dark ? "text-white" : "text-neutral-950",
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          "mt-1 text-xs font-bold uppercase tracking-[0.14em]",
          dark ? "text-white/50" : "text-neutral-500",
        )}
      >
        {label}
      </div>
    </div>
  );
}
