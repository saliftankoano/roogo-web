#!/usr/bin/env node
// Uploads the Roogo music library to the Studio (Salif, 2026-10-11).
// Run once after migration 083, with the production env loaded:
//
//   node --env-file=.env.local scripts/upload-studio-music.mjs [vault Musique folder]
//
// Only the tracks Roogo uses in its own productions, including Roogo's own
// Suno songs (Pro plan). Other artists' songs in Musique/Chansons stay out
// until their rights are confirmed. The source files
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
  // Roogo's own Suno songs and instrumentals, made on the Pro plan (commercial use
  // allowed); added for the whole team on 2026-10-11 (Salif).
  { file: "Chansons/roogo-a-verifie.mp3", title: "Rohgo a vérifié" },
  { file: "Instrumentales/basse-urbaine.mp3", title: "Basse urbaine" },
  { file: "Instrumentales/basse-roogomatise.mp3", title: "Basse roogomatisé" },
  { file: "Chansons/trouve-ta-place.mp3", title: "Trouve ta place" },
  { file: "Chansons/la-bonne-adresse.mp3", title: "La bonne adresse" },
  { file: "Chansons/trouve-ta-place-ehe.mp3", title: "Trouve ta place éhé" },
  { file: "Chansons/roogo-le-bon-choix.mp3", title: "Roogo le bon choix" },
  { file: "Chansons/l-appli-immo-du-burkina.mp3", title: "L'appli Immo du Burkina" },
  { file: "Chansons/franglita-side-by-side.mp3", title: "Franglita - Side by side" },
  { file: "Chansons/reste-pres-de-moi.mp3", title: "Reste près de moi" },
  { file: "Chansons/franglais-ensemble-ou-together.mp3", title: "Franglais - ensemble ou together" },
  { file: "Chansons/zouk-du-faso.mp3", title: "Zouk du Faso" },
  { file: "Chansons/nouveau-chez-vous.mp3", title: "Nouveau chez-vous" },
  { file: "Chansons/rohgo-trouvez-votre-maison.mp3", title: "Rohgo, trouvez votre maison" },
  { file: "Chansons/ton-bien-prend-son-envole.mp3", title: "Ton bien prend son envole" },
  { file: "Chansons/j-ai-trouve-la-reponse.mp3", title: "J'ai trouvé la reponse" },
  { file: "Chansons/mon-bien-est-en-ligne.mp3", title: "Mon bien est en ligne" },
  { file: "Chansons/je-reprends-confiance-avec-roogo.mp3", title: "Je reprends Confiance avec Roogo" },
  { file: "Chansons/le-jour-est-a-nous.mp3", title: "Le jour est à nous" },
  { file: "Chansons/choisissez-contactez.mp3", title: "Choisissez, contactez" },
  // Older Roogo Suno instrumentals (2026-04 to 2026-10), added 2026-10-11 (Salif).
  { file: "Instrumentales/balafon-market-bounce.mp3", title: "Balafon Market Bounce" },
  { file: "Instrumentales/bam-bam-doum.mp3", title: "Bam Bam Doum" },
  { file: "Instrumentales/dusk-at-the-window.mp3", title: "Dusk at the Window" },
  { file: "Instrumentales/green-ledger-flow.mp3", title: "Green Ledger Flow" },
  { file: "Instrumentales/molo-decale.mp3", title: "Molo décalé" },
  { file: "Instrumentales/music-loop.mp3", title: "Music loop" },
  { file: "Instrumentales/quatre-pas-bobo.mp3", title: "Quatre Pas Bobo" },
  { file: "Instrumentales/quiet-platform-drift.mp3", title: "Quiet Platform Drift" },
  { file: "Instrumentales/quiet-workspace.mp3", title: "Quiet Workspace" },
  { file: "Instrumentales/roogo-never-give-up.mp3", title: "Roogo never give up" },
  { file: "Instrumentales/roogo-smooth-day.mp3", title: "Roogo Smooth Day" },
  { file: "Instrumentales/roogo-wa-naang-tondo.mp3", title: "Roogo wa naang tondo" },
  { file: "Instrumentales/sahel-blues.mp3", title: "Sahel Blues" },
  { file: "Instrumentales/sahel-signal.mp3", title: "Sahel Signal" },
  { file: "Instrumentales/soft-access-loop.mp3", title: "Soft Access Loop" },
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
