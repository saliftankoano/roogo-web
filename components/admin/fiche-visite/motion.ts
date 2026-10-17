"use client";

// GSAP feedback for the field visit sheet, inside the repo's motion audit:
// short (500 ms at most), small movement (under 20 px), no overshoot, nothing
// under prefers-reduced-motion.

import gsap from "gsap";

export function reducedMotion() {
  return typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Step change: the body slides in from the side we are going to. */
export function slideStep(root: HTMLElement | null, dir: 1 | -1) {
  if (!root || reducedMotion()) return;
  const items = root.querySelectorAll(":scope > *");
  gsap.fromTo(
    items,
    { x: 16 * dir, autoAlpha: 0 },
    { x: 0, autoAlpha: 1, duration: 0.36, ease: "power3.out", stagger: 0.035, clearProps: "transform,opacity,visibility" },
  );
}

export function fadeTitle(el: HTMLElement | null) {
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { y: 6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.3, ease: "power2.out", clearProps: "transform,opacity,visibility" });
}

/** The progress segment that just became current fills from the left. */
export function growSegment(el: Element | null) {
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { scaleX: 0.2, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.36, ease: "power2.out", clearProps: "transform" });
}

/** A box that was just ticked. */
export function popTick(el: Element | null) {
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { scale: 0.985 }, { scale: 1, duration: 0.24, ease: "power2.out", clearProps: "transform" });
  const path = el.querySelector("path");
  if (path) gsap.fromTo(path, { strokeDashoffset: 18 }, { strokeDashoffset: 0, duration: 0.3, ease: "power2.out" });
}

/** A card that just changed state (time recorded, position taken, shot ticked). */
export function settle(el: Element | null, from: { y?: number; backgroundColor?: string } = { y: 4 }) {
  if (!el || reducedMotion()) return;
  if (from.backgroundColor) {
    gsap.fromTo(el, { backgroundColor: from.backgroundColor }, { backgroundColor: "#FFFFFF", duration: 0.5, ease: "power1.out", clearProps: "backgroundColor" });
    return;
  }
  gsap.fromTo(el, { y: from.y ?? 4, autoAlpha: 0.5 }, { y: 0, autoAlpha: 1, duration: 0.3, ease: "power2.out", clearProps: "transform,opacity,visibility" });
}

/** Upload bars move smoothly to their new width. */
export function moveBar(el: HTMLElement | null, pct: number) {
  if (!el) return;
  const width = `${Math.max(0, Math.min(100, pct))}%`;
  if (reducedMotion()) {
    el.style.width = width;
    return;
  }
  gsap.to(el, { width, duration: 0.3, ease: "power1.out", overwrite: true });
}

/** Done screen: summary then tasks one after the other. */
export function staggerIn(els: NodeListOf<Element> | Element[], delay = 0.1) {
  if (!els.length || reducedMotion()) return;
  gsap.fromTo(
    els,
    { x: 12, autoAlpha: 0 },
    { x: 0, autoAlpha: 1, duration: 0.35, ease: "power3.out", stagger: 0.06, delay, clearProps: "transform,opacity,visibility" },
  );
}

export function riseIn(el: Element | null) {
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: "power3.out", clearProps: "transform,opacity,visibility" });
}

/** The save pill brightens once when a save lands. */
export function pulse(el: Element | null) {
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { opacity: 0.4 }, { opacity: 1, duration: 0.3, ease: "power1.out", clearProps: "opacity" });
}
