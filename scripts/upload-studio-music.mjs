#!/usr/bin/env node
// Uploads the Roogo music library to the Studio (Salif, 2026-10-11).
// Run once after migration 083, with the production env loaded:
//
//   node --env-file=.env.local scripts/upload-studio-music.mjs [vault Musique folder]
//
// Only the tracks Roogo uses in its own productions. The artist songs in
// Musique/Chansons stay out until their rights are confirmed. The source files
// are never modified: WAV is converted to MP3 in a temp folder first.
// Safe to run again: a track already uploaded is skipped.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "content-studio";
const ROOT = process.argv[2] || "/Users/salif/Desktop/Kazedra/Roogo/knowledge/roogo/Musique";
const TRACKS = [
  { file: "Instrumentales/bienvenu-a-roogo.mp3", title: "Bienvenu à Roogo" },
  { file: "Instrumentales/good-day-ouaga.mp3", title: "Good Day Ouaga" },
  { file: "Instrumentales/jolie-princess.mp3", title: "Jolie princess" },
  { file: "Instrumentales/matin-a-bamako.mp3", title: "Matin à Bamako" },
  { file: "Instrumentales/sobo-burkinbila.mp3", title: "Sobo Burkinbila" },
  { file: "Instrumentales/tout-prendre-djo.mp3", title: "Tout prendre djo" },
  { file: "Chansons/roogo-vous-rapproche.wav", title: "Roogo vous rapproche" },
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const work = mkdtempSync(join(tmpdir(), "studio-music-"));

function seconds(path) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
  return Math.round(Number(String(out).trim()) * 100) / 100;
}

let added = 0;
for (const track of TRACKS) {
  const source = join(ROOT, track.file);
  if (!existsSync(source)) {
    console.error(`Missing: ${track.file}`);
    process.exitCode = 1;
    continue;
  }
  const slug = track.file.split("/").pop().replace(/\.(mp3|wav)$/i, "");
  const storagePath = `music/library/${slug}.mp3`;

  const { data: existing } = await supabase
    .from("studio_music_tracks")
    .select("id")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (existing) {
    console.log(`Already there: ${track.title}`);
    continue;
  }

  let mp3 = source;
  if (/\.wav$/i.test(source)) {
    mp3 = join(work, `${slug}.mp3`);
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", source, "-codec:a", "libmp3lame", "-b:a", "192k", mp3]);
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, readFileSync(mp3), { contentType: "audio/mpeg", upsert: true });
  if (uploadError) {
    console.error(`Upload failed for ${track.title}: ${uploadError.message}`);
    process.exitCode = 1;
    continue;
  }
  const { error: insertError } = await supabase.from("studio_music_tracks").insert({
    title: track.title,
    source: "library",
    duration_seconds: seconds(mp3),
    storage_path: storagePath,
  });
  if (insertError) {
    console.error(`Row failed for ${track.title}: ${insertError.message}`);
    process.exitCode = 1;
    continue;
  }
  added += 1;
  console.log(`Added: ${track.title}`);
}
console.log(`Done: ${added} added.`);
