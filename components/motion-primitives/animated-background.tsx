"use client";
import { cn } from "../../lib/utils";
import { AnimatePresence, Transition, motion } from "framer-motion";
import {
  Children,
  cloneElement,
  ReactElement,
  useEffect,
  useState,
  useId,
  ReactNode,
  isValidElement,
} from "react";

export type AnimatedBackgroundProps = {
  children: ReactNode;
  defaultValue?: string;
  onValueChange?: (newActiveId: string | null) => void;
  className?: string;
  transition?: Transition;
  enableHover?: boolean;
};

export function AnimatedBackground({
  children,
  defaultValue,
  onValueChange,
  className,
  transition,
  enableHover = false,
}: AnimatedBackgroundProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const uniqueId = useId();

  const handleSetActiveId = (id: string | null) => {
    setActiveId(id);
    if (onValueChange) {
      onValueChange(id);
    }
  };

  useEffect(() => {
    if (defaultValue !== undefined) {
      setActiveId(defaultValue);
    }
  }, [defaultValue]);

  return Children.map(children, (child, index) => {
    if (!isValidElement(child)) {
      return null;
    }

    const childProps = child.props as {
      "data-id"?: string;
      className?: string;
      children?: ReactNode;
    };
    const id = childProps["data-id"];

    const interactionProps = enableHover
      ? {
          onMouseEnter: () => handleSetActiveId(id ?? null),
          onMouseLeave: () => handleSetActiveId(null),
        }
      : {
          onClick: () => handleSetActiveId(id ?? null),
        };

    const mergedProps = {
      key: index,
      className: cn("relative inline-flex", childProps.className),
      "data-checked": activeId === id ? "true" : "false",
      ...interactionProps,
    } as unknown as React.HTMLAttributes<HTMLElement>;

    return cloneElement(
      child as ReactElement<typeof mergedProps>,
      mergedProps,
      <>
        <AnimatePresence initial={false}>
          {activeId === id && (
            <motion.div
              layoutId={`background-${uniqueId}`}
              className={cn("absolute inset-0", className)}
              transition={transition}
              initial={{ opacity: defaultValue ? 1 : 0 }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
              }}
            />
          )}
        </AnimatePresence>
        <div className="z-10 flex items-center gap-2">
          {childProps.children}
        </div>
      </>
    );
  });
}
