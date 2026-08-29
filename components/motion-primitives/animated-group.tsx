"use client";
import { ReactNode } from "react";
import { motion, useReducedMotion, Variants } from "framer-motion";
import React from "react";
import { roogoEase } from "@/lib/motion";

export type PresetType =
  | "fade"
  | "slide"
  | "scale"
  | "blur"
  | "blur-slide"
  | "zoom"
  | "flip"
  | "bounce"
  | "rotate"
  | "swing";

export type AnimatedGroupProps = {
  children: ReactNode;
  className?: string;
  variants?: {
    container?: Variants;
    item?: Variants;
  };
  preset?: PresetType;
  as?: React.ElementType;
  asChild?: React.ElementType;
};

const defaultContainerVariants: Variants = {
  visible: {
    transition: {
      delayChildren: 0.02,
      staggerChildren: 0.06,
    },
  },
};

const defaultItemVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const presetVariants: Record<PresetType, Variants> = {
  fade: {},
  slide: {
    hidden: { y: 12 },
    visible: { y: 0 },
  },
  scale: {
    hidden: { scale: 0.985 },
    visible: { scale: 1 },
  },
  blur: {
    hidden: { filter: "blur(6px)" },
    visible: { filter: "blur(0px)" },
  },
  "blur-slide": {
    hidden: { filter: "blur(6px)", y: 10 },
    visible: { filter: "blur(0px)", y: 0 },
  },
  zoom: {
    hidden: { scale: 0.985, y: 8 },
    visible: { scale: 1, y: 0 },
  },
  flip: {
    hidden: { y: 12 },
    visible: { y: 0 },
  },
  bounce: {
    hidden: { y: 12 },
    visible: { y: 0 },
  },
  rotate: {
    hidden: { scale: 0.98, y: 8 },
    visible: { scale: 1, y: 0 },
  },
  swing: {
    hidden: { x: -8 },
    visible: { x: 0 },
  },
};

const addDefaultVariants = (variants: Variants) => ({
  hidden: { ...defaultItemVariants.hidden, ...variants.hidden },
  visible: {
    ...defaultItemVariants.visible,
    ...variants.visible,
    transition: { duration: 0.32, ease: roogoEase },
  },
});

function AnimatedGroup({
  children,
  className,
  variants,
  preset,
  as = "div",
  asChild = "div",
}: AnimatedGroupProps) {
  const reduceMotion = useReducedMotion();
  const selectedVariants = {
    item: addDefaultVariants(preset ? presetVariants[preset] : {}),
    container: addDefaultVariants(defaultContainerVariants),
  };
  const containerVariants = variants?.container || selectedVariants.container;
  const itemVariants = variants?.item || selectedVariants.item;

  const MotionComponent = React.useMemo(
    () =>
      motion.create(as as React.ComponentType<{ className?: string }> | string),
    [as]
  );
  const MotionChild = React.useMemo(
    () =>
      motion.create(
        asChild as React.ComponentType<{ className?: string }> | string
      ),
    [asChild]
  );

  return (
    <MotionComponent
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={containerVariants}
      className={className}
    >
      {React.Children.map(children, (child, index) => (
        <MotionChild key={index} variants={itemVariants}>
          {child}
        </MotionChild>
      ))}
    </MotionComponent>
  );
}

export { AnimatedGroup };
