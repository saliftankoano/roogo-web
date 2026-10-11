import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

// HeyGen renders at a very high bitrate (a 34 s video of a field came out at
// 85 MB on 2026-10-11) and Supabase refuses files over 50 MB. Every render is
// re-encoded once: same picture to the eye, about a seventh of the size, which
// also makes the download light on a phone plan (13 MB for the same video).

/** Supabase's project-wide upload limit, with a margin. */
export const MAX_STORED_VIDEO_BYTES = 48 * 1024 * 1024;

const FFMPEG_ARGS = [
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
  "-maxrate", "8M", "-bufsize", "16M", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "160k",
  "-movflags", "+faststart",
];

/** Re-encodes an MP4; null when ffmpeg is missing or fails. */
export async function compressVideo(input: Buffer): Promise<Buffer | null> {
  if (!ffmpegPath) return null;
  const id = randomUUID();
  const source = join(tmpdir(), `studio-${id}-in.mp4`);
  const target = join(tmpdir(), `studio-${id}-out.mp4`);
  try {
    await writeFile(source, input);
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(ffmpegPath as string, ["-loglevel", "error", "-y", "-i", source, ...FFMPEG_ARGS, target]);
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + String(chunk)).slice(-500);
      });
      child.on("error", () => resolve(false));
      child.on("close", (code) => {
        if (code !== 0) console.error("Studio: video compression failed", code, stderr);
        resolve(code === 0);
      });
    });
    if (!ok) return null;
    const output = await readFile(target);
    return output.length > 0 ? output : null;
  } catch (error) {
    console.error("Studio: video compression error", error instanceof Error ? error.message : error);
    return null;
  } finally {
    await Promise.all([rm(source, { force: true }), rm(target, { force: true })]);
  }
}
