/**
 * Client-side image compression before base64 upload.
 *
 * Why: Next.js 15 caps the buffered request body at 10 MB
 * (`experimental.middlewareClientMaxBodySize`). Base64 inflates image size
 * by ~33%, so a couple of full-res phone photos in one JSON body easily
 * crosses that cap, causing the server to receive a truncated payload
 * and JSON.parse to throw. Compressing + resizing on the client avoids
 * the issue entirely and also dramatically speeds uploads on slow
 * connections (e.g. mobile networks in West Africa).
 *
 * Strategy:
 * 1. If the file is HEIC/HEIF (common on iPhones), transparently decode
 *    it to JPEG via `heic-to` (libheif-js WASM). This runs in the
 *    browser and avoids storing HEIC in Supabase, which neither Chrome
 *    nor Firefox can render in <img> tags.
 * 2. Draw the resulting image onto a canvas, resize so the longest side
 *    is at most MAX_DIMENSION, re-encode as JPEG at QUALITY.
 * 3. If any of the above fails (extremely obscure format, decoder
 *    crash), fall back to uploading the original bytes as base64 so the
 *    flow still succeeds instead of blocking the user.
 */

import { heicTo, isHeic } from "heic-to";

const MAX_DIMENSION = 1920;
const QUALITY = 0.82;

export interface CompressedImage {
  data: string;
  width: number;
  height: number;
  ext: string;
}

function readAsDataUrl(blob: Blob, originalName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error(`Failed to read file "${originalName}"`));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result) {
        reject(new Error(`Empty read result for "${originalName}"`));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
}

function compressViaCanvas(
  fileName: string,
  dataUrl: string,
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onerror = () =>
      reject(
        new Error(
          `Browser could not decode "${fileName}" (unsupported format)`,
        ),
      );
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width <= 0 || height <= 0) {
          reject(new Error(`Invalid image dimensions for "${fileName}"`));
          return;
        }
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL("image/jpeg", QUALITY);
        const base64 = compressedDataUrl.split(",")[1] ?? "";
        resolve({ data: base64, width, height, ext: "jpg" });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.src = dataUrl;
  });
}

function detectExtension(file: File): string {
  const fromName = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : undefined;
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  if (file.type === "image/heic" || file.type === "image/heif") return "heic";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

async function maybeDecodeHeic(file: File): Promise<Blob> {
  // Detect HEIC by filename as well as magic bytes; iOS sometimes sets
  // an empty or generic MIME type, so isHeic checks the bytes.
  const looksHeic =
    /\.hei[cf]$/i.test(file.name) ||
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    (await isHeic(file));
  if (!looksHeic) return file;
  return await heicTo({
    blob: file,
    type: "image/jpeg",
    quality: QUALITY,
  });
}

export async function compressImageToBase64(
  file: File,
): Promise<CompressedImage> {
  let decoded: Blob;
  try {
    decoded = await maybeDecodeHeic(file);
  } catch (err) {
    console.warn(
      `[clientImageCompression] HEIC decode failed for "${file.name}", will try canvas directly:`,
      err,
    );
    decoded = file;
  }

  const dataUrl = await readAsDataUrl(decoded, file.name);
  try {
    return await compressViaCanvas(file.name, dataUrl);
  } catch (err) {
    // Browser couldn't decode even after HEIC conversion attempt. Fall
    // back to uploading the original bytes so the flow doesn't block.
    console.warn(
      `[clientImageCompression] Canvas compression failed for "${file.name}", falling back to raw upload:`,
      err,
    );
    const rawDataUrl = await readAsDataUrl(file, file.name);
    const base64 = rawDataUrl.split(",")[1] ?? "";
    return {
      data: base64,
      width: 0,
      height: 0,
      ext: detectExtension(file),
    };
  }
}
