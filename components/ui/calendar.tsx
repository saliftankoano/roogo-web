"use client";

import * as React from "react";
import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  // Helper function to get button styles matching the Button component
  const getButtonStyles = (
    variant: "primary" | "secondary" | "outline" | "ghost" = "outline"
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center rounded-full font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";
    const variants = {
      primary:
        "bg-primary text-white hover:bg-primary-hover focus:ring-primary",
      secondary:
        "bg-secondary text-neutral-900 hover:bg-secondary/80 focus:ring-secondary",
      outline:
        "border border-neutral-200 bg-transparent text-primary hover:bg-neutral-50 focus:ring-primary",
      ghost:
        "bg-transparent text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 focus:ring-neutral-500",
    };
    return cn(baseStyles, variants[variant]);
  };

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-white group/calendar p-6 sm:p-8 rounded-[40px] border border-neutral-100 shadow-xl shadow-neutral-200/40 [--cell-size:3rem] sm:[--cell-size:3.2rem] md:[--cell-size:3.8rem]",
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-full", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-6 md:flex-row w-full",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-8", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1 z-10",
          defaultClassNames.nav
        ),
        button_previous: cn(
          getButtonStyles("outline"),
          "h-11 w-11 rounded-2xl border-neutral-100 hover:bg-neutral-50 hover:border-primary/20 transition-all p-0 shadow-sm active:scale-90",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          getButtonStyles("outline"),
          "h-11 w-11 rounded-2xl border-neutral-100 hover:bg-neutral-50 hover:border-primary/20 transition-all p-0 shadow-sm active:scale-90",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-11 w-full items-center justify-center px-12 mb-2",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          "text-2xl font-extrabold text-neutral-900 tracking-tight capitalize",
          defaultClassNames.caption_label
        ),
        table: "w-full border-separate border-spacing-y-2",
        weekdays: cn(
          "flex justify-between mb-4 px-2",
          defaultClassNames.weekdays
        ),
        weekday: cn(
          "text-neutral-400 flex-1 text-center text-[11px] font-bold uppercase tracking-[0.2em]",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full justify-between gap-2", defaultClassNames.week),
        day: cn(
          "relative p-0 text-center group/day aspect-square select-none flex-1",
          defaultClassNames.day
        ),
        today: cn(
          "bg-primary/5 text-primary rounded-2xl border border-primary/10 font-black",
          defaultClassNames.today
        ),
        outside: cn("text-neutral-200 opacity-40", defaultClassNames.outside),
        disabled: cn("text-neutral-300 opacity-50", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <CaretLeftIcon
                size={20}
                weight="bold"
                className={props.className}
              />
            );
          }
          if (orientation === "right") {
            return (
              <CaretRightIcon
                size={20}
                weight="bold"
                className={props.className}
              />
            );
          }
          return (
            <CaretDownIcon
              size={20}
              weight="bold"
              className={props.className}
            />
          );
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const isSelected = modifiers.selected;
  const isToday = modifiers.today;

  return (
    <Button
      ref={ref}
      variant="ghost"
      className={cn(
        "rounded-2xl! aspect-square h-auto w-full min-w-[--cell-size] flex items-center justify-center font-bold text-[15px] transition-all duration-300 relative overflow-hidden",
        isSelected
          ? "text-white shadow-xl shadow-primary/30 z-10"
          : "hover:bg-neutral-50 hover:text-primary text-neutral-900",
        isToday &&
          !isSelected &&
          "bg-primary/5 border-primary/20 text-primary font-black shadow-inner shadow-primary/10",
        className
      )}
      {...props}
    >
      <span className="relative z-10">{day.date.getDate()}</span>
      {/* Background decoration for selected */}
      {isSelected && (
        <motion.div
          layoutId="day-select"
          className="absolute inset-0 bg-primary rounded-2xl"
          initial={false}
          transition={{
            type: "tween",
            duration: 0.3,
            ease: "easeInOut",
          }}
        />
      )}
    </Button>
  );
}

export { Calendar, CalendarDayButton };
