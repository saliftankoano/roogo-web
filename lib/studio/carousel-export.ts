// Browser only: draws one carousel slide to a 1080x1350 JPEG.
//
// The slide page (carouselSlidePage) is turned into an SVG <foreignObject>
// with every photo, the logo and the fonts inlined as data URLs, then drawn
// on a canvas. Chrome renders it with the same engine as the skill's
// headless screenshots, so the Studio and the skill give the same slides.
// No server rendering and no extra dependency.

import { DEFAULT_FONTS_URL, SLIDE_HEIGHT, SLIDE_WIDTH, carouselSlidePage, type CarouselSpec } from "./carousel";

const dataUrlCache = new Map<string, Promise<string>>();
const fontCssCache = new Map<string, Promise<string>>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Lecture impossible"));
    reader.readAsDataURL(blob);
  });
}

function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return Promise.resolve(url);
  const cached = dataUrlCache.get(url);
  if (cached) return cached;
  const loading = fetch(url, { mode: "cors", credentials: "omit" })
    .then((res) => {
      if (!res.ok) throw new Error(`Image indisponible (HTTP ${res.status})`);
      return res.blob();
    })
    .then(blobToDataUrl);
  loading.catch(() => dataUrlCache.delete(url));
  dataUrlCache.set(url, loading);
  return loading;
}

/** The Google Fonts CSS with its latin font files inlined (French needs latin and latin-ext only). */
function inlineFontCss(cssUrl: string): Promise<string> {
  const cached = fontCssCache.get(cssUrl);
  if (cached) return cached;
  const loading = (async () => {
    const css = await fetch(cssUrl, { mode: "cors", credentials: "omit" }).then((r) => {
      if (!r.ok) throw new Error(`Polices indisponibles (HTTP ${r.status})`);
      return r.text();
    });
    const blocks = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter((b) => /\/\*\s*latin(-ext)?\s*\*\//.test(b) || !/\/\*/.test(b));
    const kept = blocks.join("\n");
    const urls = [...new Set([...kept.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
    const inlined = await Promise.all(urls.map((u) => toDataUrl(u).then((d) => [u, d] as const)));
    return inlined.reduce((acc, [u, d]) => acc.split(u).join(d), kept);
  })();
  loading.catch(() => fontCssCache.delete(cssUrl));
  fontCssCache.set(cssUrl, loading);
  return loading;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Le rendu de la slide a échoué."));
    img.src = src;
  });
}

export type ExportInput = {
  spec: CarouselSpec;
  index: number;
  /** Signed or public URL of every photo ref the spec uses. */
  resolve: (ref: string) => string;
  badgeUrl: string;
  quality?: number;
};

export async function renderSlideJpeg({ spec, index, resolve, badgeUrl, quality = 0.92 }: ExportInput): Promise<Blob> {
  const slide = spec.slides[index - 1];
  const refs = [slide.photo, ...(spec.brand?.badge ? [spec.brand.badge] : [])];
  const inlined = new Map<string, string>();
  await Promise.all(refs.map(async (ref) => inlined.set(ref, await toDataUrl(resolve(ref)))));
  const badge = await toDataUrl(new URL(badgeUrl, window.location.origin).href);
  const fontCss = await inlineFontCss(spec.theme?.fonts?.google_fonts_url || DEFAULT_FONTS_URL);

  const page = carouselSlidePage(spec, index, { photoUrl: (ref) => inlined.get(ref) ?? resolve(ref), badgeUrl: badge });
  const doc = new DOMParser().parseFromString(page, "text/html");
  doc.querySelectorAll("link[rel=stylesheet]").forEach((l) => l.remove());
  const style = doc.createElement("style");
  style.textContent = fontCss;
  doc.head.prepend(style);
  doc.querySelectorAll("img").forEach((img) => img.removeAttribute("crossorigin"));
  const xhtml = new XMLSerializer().serializeToString(doc.documentElement);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_WIDTH}" height="${SLIDE_HEIGHT}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  // A data: URL, not a blob: URL: Chrome taints the canvas for a blob SVG with
  // a foreignObject, which blocks the JPEG export.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  {
    const img = await loadImage(url);
    await img.decode().catch(() => undefined);
    // Fonts inside the SVG finish loading a moment after decode in Chrome.
    await new Promise((r) => setTimeout(r, 120));
    const canvas = document.createElement("canvas");
    canvas.width = SLIDE_WIDTH;
    canvas.height = SLIDE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Le navigateur ne peut pas dessiner la slide.");
    ctx.drawImage(img, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("Export JPEG impossible."))), "image/jpeg", quality),
    );
  }
}
