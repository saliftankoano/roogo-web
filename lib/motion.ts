export const roogoEase = [0.22, 1, 0.36, 1] as const;

export const roogoMotion = {
  quick: { duration: 0.16, ease: roogoEase },
  standard: { duration: 0.26, ease: roogoEase },
  deliberate: { duration: 0.42, ease: roogoEase },
  spring: { type: "spring", stiffness: 520, damping: 42, mass: 0.7 },
} as const;
