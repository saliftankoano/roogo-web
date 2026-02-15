import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-neutral-100 p-1 text-neutral-500 shadow-sm shadow-black/5 ring-1 ring-black/5 transition-all duration-200 dark:bg-neutral-800 dark:text-neutral-400 dark:shadow-none dark:ring-white/10",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:text-neutral-900 hover:bg-white/40 active:scale-[0.98] data-[state=active]:bg-white data-[state=active]:text-neutral-950 data-[state=active]:shadow-sm data-[state=active]:scale-[1.01] dark:ring-offset-neutral-950 dark:focus-visible:ring-neutral-300 dark:hover:bg-neutral-950/40 dark:hover:text-neutral-50 dark:data-[state=active]:bg-neutral-950 dark:data-[state=active]:text-neutral-50 after:absolute after:bottom-1 after:left-3 after:right-3 after:h-[2px] after:rounded-full after:bg-blue-600 after:opacity-0 after:scale-x-75 after:transition-all after:duration-300 data-[state=active]:after:opacity-100 data-[state=active]:after:scale-x-100 dark:after:bg-blue-400",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 data-[state=active]:slide-in-from-bottom-2 data-[state=inactive]:animate-out data-[state=inactive]:fade-out-0 data-[state=inactive]:zoom-out-95 data-[state=inactive]:slide-out-to-bottom-2 dark:ring-offset-neutral-950 dark:focus-visible:ring-neutral-300",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
