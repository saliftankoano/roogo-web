import * as React from "react";
import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
  WarningIcon,
  ChatCircleTextIcon,
} from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

export type AlertTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: AlertTone;
  title?: React.ReactNode;
  /** Replace the default tone icon; pass null to hide it. */
  icon?: React.ReactNode | null;
  /** Optional action slot rendered on the right (a Button, a link). */
  action?: React.ReactNode;
}

const toneStyles: Record<AlertTone, { box: string; icon: string }> = {
  neutral: {
    box: "border-line-soft bg-paper text-ink-body",
    icon: "text-ink-muted",
  },
  info: {
    box: "border-info/20 bg-info-soft text-info-strong",
    icon: "text-info",
  },
  success: {
    box: "border-success/20 bg-success-soft text-success-strong",
    icon: "text-success",
  },
  warning: {
    box: "border-warning/25 bg-warning-soft text-warning-strong",
    icon: "text-warning-strong",
  },
  danger: {
    box: "border-danger/20 bg-danger-soft text-danger-strong",
    icon: "text-danger",
  },
};

const toneIcons: Record<AlertTone, React.ReactNode> = {
  neutral: <ChatCircleTextIcon size={20} weight="fill" />,
  info: <InfoIcon size={20} weight="fill" />,
  success: <CheckCircleIcon size={20} weight="fill" />,
  warning: <WarningIcon size={20} weight="fill" />,
  danger: <WarningCircleIcon size={20} weight="fill" />,
};

/** Inline notice. The danger tone announces itself with role="alert". */
export function Alert({
  tone = "neutral",
  title,
  icon,
  action,
  className,
  children,
  ...props
}: AlertProps) {
  const styles = toneStyles[tone];
  const resolvedIcon = icon === undefined ? toneIcons[tone] : icon;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-2xl border px-4 py-3.5 text-sm",
        styles.box,
        className,
      )}
      {...props}
    >
      {resolvedIcon && (
        <span className={cn("mt-0.5 shrink-0", styles.icon)} aria-hidden="true">
          {resolvedIcon}
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-bold leading-5">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
