import React from "react";
import { SpinnerGapIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner, disables the button and announces aria-busy. */
  loading?: boolean;
  /** Icon rendered before the label, forced to the size's icon box. */
  leftIcon?: React.ReactNode;
  /** Icon rendered after the label, forced to the size's icon box. */
  rightIcon?: React.ReactNode;
  /**
   * Lets the button shrink in a narrow column: the label is cut with an
   * ellipsis instead of overflowing. A string label becomes the title.
   */
  truncate?: boolean;
}

export const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover focus:ring-primary",
  secondary:
    "bg-secondary text-neutral-900 hover:bg-secondary/80 focus:ring-secondary",
  outline:
    "border border-neutral-200 bg-transparent text-primary hover:bg-neutral-50 focus:ring-primary",
  ghost:
    "bg-transparent text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 focus:ring-neutral-500",
  destructive: "bg-danger text-white hover:bg-danger-strong focus:ring-danger",
};

/** Fixed heights, never vertical padding: a button can't grow taller. */
export const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-6 text-base gap-2",
  lg: "h-12 px-8 text-lg gap-2.5",
  icon: "h-11 w-11 p-0",
};

/** Icon box per size (16 / 18 / 20 px). The svg fills it and never shrinks. */
export const buttonIconSizes: Record<ButtonSize, string> = {
  sm: "h-4 w-4",
  md: "h-[18px] w-[18px]",
  lg: "h-5 w-5",
  icon: "h-5 w-5",
};

const iconBox =
  "inline-flex shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full [&>svg]:shrink-0";

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      leftIcon,
      rightIcon,
      truncate = false,
      disabled,
      title,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] enabled:active:scale-[0.985] motion-reduce:transform-none focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

    const isDisabled = disabled || loading;
    const iconClass = cn(iconBox, buttonIconSizes[size]);
    const resolvedTitle =
      title ?? (truncate && typeof children === "string" ? children : undefined);

    const spinner = (
      <span className={iconClass} aria-hidden="true">
        <SpinnerGapIcon
          weight="bold"
          className="animate-spin motion-reduce:animate-none"
        />
      </span>
    );

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          buttonVariants[variant],
          buttonSizes[size],
          fullWidth && "w-full",
          truncate && "min-w-0 max-w-full",
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        title={resolvedTitle}
        {...props}
      >
        {size === "icon" ? (
          loading ? (
            spinner
          ) : (
            <span className={iconClass}>{children}</span>
          )
        ) : (
          <>
            {loading
              ? spinner
              : leftIcon && (
                  <span className={iconClass} aria-hidden="true">
                    {leftIcon}
                  </span>
                )}
            <span
              className={cn(
                "whitespace-nowrap",
                truncate && "min-w-0 truncate",
              )}
            >
              {children}
            </span>
            {!loading && rightIcon && (
              <span className={iconClass} aria-hidden="true">
                {rightIcon}
              </span>
            )}
          </>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
