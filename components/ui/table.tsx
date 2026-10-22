"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type Density = "default" | "compact";

const DensityContext = React.createContext<Density>("default");

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Compact halves the row padding for dense admin lists. */
  density?: Density;
  /** Alternate row backgrounds. */
  zebra?: boolean;
}

/**
 * Admin table. Wrap in nothing: the component already scrolls horizontally
 * inside a rounded card so it never breaks the page width on mobile.
 */
const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, density = "default", zebra = false, ...props }, ref) => (
    <DensityContext.Provider value={density}>
      <div className="w-full overflow-x-auto rounded-2xl border border-line bg-white">
        <table
          ref={ref}
          className={cn(
            "w-full caption-bottom text-sm",
            zebra && "[&_tbody_tr:nth-child(even)]:bg-paper",
            className,
          )}
          {...props}
        />
      </div>
    </DensityContext.Provider>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("border-b border-line bg-paper", className)}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("divide-y divide-line-soft", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-line bg-paper font-semibold",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "transition-colors duration-100 hover:bg-cream data-[state=selected]:bg-cream",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

export interface TableCellProps
  extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligns and uses tabular figures. */
  numeric?: boolean;
}

const TableHead = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, numeric, ...props }, ref) => {
    const density = React.useContext(DensityContext);
    return (
      <th
        ref={ref}
        scope="col"
        className={cn(
          "text-left align-middle text-xs font-extrabold uppercase tracking-[0.06em] text-ink-muted",
          density === "compact" ? "px-3 py-2" : "px-5 py-3.5",
          numeric && "text-right",
          className,
        )}
        {...props}
      />
    );
  },
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, numeric, ...props }, ref) => {
    const density = React.useContext(DensityContext);
    return (
      <td
        ref={ref}
        className={cn(
          "align-middle text-ink-body",
          density === "compact" ? "px-3 py-2" : "px-5 py-3.5",
          numeric && "text-right font-semibold tabular-nums text-ink",
          className,
        )}
        {...props}
      />
    );
  },
);
TableCell.displayName = "TableCell";

/** Full-width row used when the table has nothing to show. */
function TableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center">
        {children}
      </td>
    </tr>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
};
