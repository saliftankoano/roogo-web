import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const sourceRoots = ["app", "components"];
const verbose = process.argv.includes("--verbose");

async function collectFiles(directory) {
  const entries = await readdir(path.join(projectRoot, directory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(relativePath)));
    } else if (/\.(?:css|ts|tsx)$/.test(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

const files = (await Promise.all(sourceRoots.map(collectFiles))).flat().sort();
const contents = new Map(
  await Promise.all(
    files.map(async (file) => [file, await readFile(path.join(projectRoot, file), "utf8")]),
  ),
);

const requiredSignals = [
  {
    file: "app/layout.tsx",
    pattern: /<AppMotionProvider>\{children\}<\/AppMotionProvider>/,
    message: "the root layout must wrap every route with AppMotionProvider",
  },
  {
    file: "components/motion/AppMotionProvider.tsx",
    pattern: /reducedMotion="user"/,
    message: "Framer Motion must honor the user's reduced-motion preference",
  },
  {
    file: "app/globals.css",
    pattern: /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    message: "CSS motion must provide a reduced-motion state",
  },
];

const violations = [];

for (const signal of requiredSignals) {
  if (!signal.pattern.test(contents.get(signal.file) ?? "")) {
    violations.push(`${signal.file}: ${signal.message}`);
  }
}

const bannedPatterns = [
  {
    pattern: /(?:hover|group-hover):scale-(?:105|110)\b/g,
    message: "hover zoom exceeds the restrained 1.5% image limit",
  },
  {
    pattern: /active:scale-(?:90|95)\b/g,
    message: "press feedback is stronger than the shared 98.5% response",
  },
  {
    pattern: /hover:-translate-y-1\b/g,
    message: "card hover lift exceeds 2px",
  },
  {
    pattern: /\bscale:\s*0\.(?:[0-8]\d*|9[0-7])\b/g,
    message: "entrance or exit scale is below 98%",
    allow: (file, line) =>
      file === "components/visites-3d/SlotList.tsx" && line.includes("scale: 0.85"),
  },
  {
    pattern: /\b[xy]:\s*-?(?:[2-9]\d|\d{3,})\b/g,
    message: "movement distance is 20px or greater",
  },
  {
    pattern: /duration:\s*(?:0\.[6-9]|[1-9]\d*(?:\.\d+)?)\b/g,
    message: "one-shot motion exceeds 500ms",
    allow: (file, line) =>
      file === "components/marketing/MarketingPrimitives.tsx" &&
      line.includes("repeat: Infinity"),
  },
  {
    pattern: /ease:\s*\[0\.34,\s*1\.56/g,
    message: "overshooting easing is outside the shared motion grammar",
  },
  {
    pattern: /\brotate:\s*-?(?:180|360)\b/g,
    message: "full or half-turn entrance motion is not allowed",
  },
  {
    pattern: /animate-(?:bounce|ping)\b/g,
    message: "decorative perpetual utility animation is not allowed",
  },
];

for (const [file, source] of contents) {
  const lines = source.split("\n");
  for (const [index, line] of lines.entries()) {
    for (const rule of bannedPatterns) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line) && !rule.allow?.(file, line)) {
        violations.push(`${file}:${index + 1}: ${rule.message}`);
      }
    }
  }

  if (source.includes("repeat: Infinity") && !source.includes("useReducedMotion")) {
    violations.push(`${file}: infinite motion must have an explicit reduced-motion state`);
  }
}

const pageFiles = files.filter((file) => file.endsWith("/page.tsx"));
const locallyAnimatedPages = pageFiles.filter((file) => {
  const source = contents.get(file) ?? "";
  return /framer-motion|motion\.|animate-|transition-/.test(source);
});

if (pageFiles.length === 0) {
  violations.push("app: no App Router page files were found");
}

if (violations.length > 0) {
  console.error("Motion audit failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `Motion audit passed: ${pageFiles.length} pages covered by the root provider; ` +
    `${locallyAnimatedPages.length} pages add purposeful local motion.`,
);

if (verbose) {
  const localMotion = new Set(locallyAnimatedPages);
  for (const file of pageFiles) {
    const route =
      "/" +
      file
        .replace(/^app\//, "")
        .replace(/(?:^|\/)page\.tsx$/, "")
        .split("/")
        .filter((segment) => !/^\(.+\)$/.test(segment))
        .join("/");
    console.log(
      `${route === "/" ? "/" : route} — ${localMotion.has(file) ? "inline marker + global" : "global"}`,
    );
  }
}
