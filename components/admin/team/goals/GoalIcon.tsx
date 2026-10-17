// Goal icons from the approved canvas: real platform logos for TikTok,
// Facebook and Instagram, the Roogo logo for users, a house for sales, a key
// for rentals and a house-plus for new listings.

import { cn } from "@/lib/utils";
import type { GoalIcon as GoalIconKind } from "@/lib/team-goals/core";

const TIKTOK_PATH =
  "M14.3 1h-3.4v13.6a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V8.3a6.4 6.4 0 1 0 5.4 6.3V7.8a8 8 0 0 0 4.7 1.5V5.9A4.7 4.7 0 0 1 14.3 1z";

export function GoalIcon({ kind, size = 36, className }: { kind: GoalIconKind; size?: number; className?: string }) {
  const box = cn("inline-flex shrink-0 items-center justify-center rounded-[10px]", className);
  const style = { width: size, height: size };
  const inner = Math.round(size * 0.56);
  switch (kind) {
    case "app":
      return (
        <span aria-hidden="true" style={style} className={cn(box, "bg-white shadow-[inset_0_0_0_1px_#EAE1D5]")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={Math.round(size * 0.66)} height={Math.round(size * 0.66)} className="object-contain" />
        </span>
      );
    case "tiktok":
      return (
        <span aria-hidden="true" style={style} className={cn(box, "bg-black")}>
          <svg width={inner} height={Math.round(inner * 1.1)} viewBox="0 0 20 22">
            <path d={TIKTOK_PATH} fill="#25F4EE" transform="translate(-0.9,-0.6)" />
            <path d={TIKTOK_PATH} fill="#FE2C55" transform="translate(0.9,0.6)" />
            <path d={TIKTOK_PATH} fill="#FFFFFF" />
          </svg>
        </span>
      );
    case "facebook":
      return (
        <span aria-hidden="true" style={style} className={cn(box, "bg-white shadow-[inset_0_0_0_1px_#EAE1D5]")}>
          <svg width={Math.round(size * 0.66)} height={Math.round(size * 0.66)} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="12" fill="#0866FF" />
            <path d="M13.4 24v-8.5h2.7l.5-3.3h-3.2v-2.1c0-.9.4-1.8 1.9-1.8h1.4V5.5s-1.3-.2-2.6-.2c-2.6 0-4.3 1.6-4.3 4.5v2.4H7v3.3h2.8V24z" fill="#FFFFFF" />
          </svg>
        </span>
      );
    case "instagram":
      return (
        <span
          aria-hidden="true"
          style={{ ...style, background: "linear-gradient(45deg,#FEDA75,#FA7E1E 30%,#D62976 60%,#962FBF 80%,#4F5BD5)" }}
          className={box}
        >
          <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="#FFFFFF" stroke="none" />
          </svg>
        </span>
      );
    case "vente":
      return (
        <span aria-hidden="true" style={style} className={cn(box, "bg-[#F7E4D3] text-[#8A4924]")}>
          <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l9-7 9 7" />
            <path d="M5 10v10h14V10" />
            <path d="M9.5 15.5l2 2 3.5-4" />
          </svg>
        </span>
      );
    case "location":
      return (
        <span aria-hidden="true" style={style} className={cn(box, "bg-[#E1EFF8] text-[#1F5F80]")}>
          <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="15" r="4" />
            <path d="M11 12l9-9" />
            <path d="M16 7l3 3" />
            <path d="M14 9l2 2" />
          </svg>
        </span>
      );
    default:
      return (
        <span aria-hidden="true" style={style} className={cn(box, "bg-[#DDF0E2] text-[#245C33]")}>
          <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l9-7 9 7" />
            <path d="M5 10v10h14V10" />
            <path d="M12 12v5M9.5 14.5h5" />
          </svg>
        </span>
      );
  }
}

export const STATUS_CHIP: Record<"green" | "amber" | "red" | "grey", string> = {
  green: "bg-[#DDF0E2] text-[#245C33]",
  amber: "bg-[#FBEBC9] text-[#6E4300]",
  red: "bg-[#FBE3DF] text-[#8E2A1E]",
  grey: "bg-[#EEEBE7] text-[#4A4540]",
};

export const STATUS_FILL: Record<"green" | "amber" | "red" | "grey", string> = {
  green: "bg-[#2F7A48]",
  amber: "bg-[#C96A2E]",
  red: "bg-[#B5452F]",
  grey: "bg-[#B9AEA2]",
};

export const TAB_BADGE: Record<"mois" | "trimestre" | "annee", string> = {
  mois: "bg-[#E1EFF8] text-[#1F5F80]",
  trimestre: "bg-[#F7E4D3] text-[#8A4924]",
  annee: "bg-[#EEEBE7] text-[#4A4540]",
};
