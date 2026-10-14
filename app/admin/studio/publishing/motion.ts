"use client";

import gsap from "gsap";

/** GSAP only when the viewer has not asked for reduced motion. */
export function motionOn(): boolean {
  if (typeof window === "undefined") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isPhone(): boolean {
  return typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches;
}

/** Status pill change (design StudioVideo: back.out pop). */
export function popPill(el: Element | null) {
  if (!el || !motionOn()) return;
  gsap.fromTo(el, { scale: 0.85, opacity: 0.4 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" });
}

/** Stepper dots, one after the other. */
export function popDots(els: ArrayLike<Element> | null) {
  if (!els || !els.length || !motionOn()) return;
  gsap.fromTo(els, { scale: 0.7 }, { scale: 1, duration: 0.35, ease: "back.out(2.2)", stagger: 0.06 });
}

export function riseIn(el: Element | null, delay = 0) {
  if (!el || !motionOn()) return;
  gsap.fromTo(el, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out", delay });
}

export function chipsIn(els: ArrayLike<Element> | null) {
  if (!els || !els.length || !motionOn()) return;
  gsap.fromTo(els, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)", stagger: 0.05, delay: 0.15 });
}

/** Placeholder lines while the description is written. Returns a stop function. */
export function shimmer(els: ArrayLike<Element> | null): () => void {
  if (!els || !els.length || !motionOn()) return () => {};
  const tween = gsap.fromTo(els, { opacity: 0.35 }, { opacity: 1, duration: 0.6, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: 0.12 });
  return () => tween.kill();
}
