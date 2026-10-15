import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECT_CHUNK_BYTES,
  PROXY_CHUNK_BYTES,
  checkFinalizedFile,
  checkUploadRequest,
  chunkAt,
  cleanFileName,
  driveQueryValue,
  driveTopFolder,
  fieldMediaKind,
  fieldMediaMimeType,
  findFolderMatch,
  folderKey,
  formatBytes,
  nextOffsetFromRange,
  propertyFolderName,
} from "./field-media-rules.ts";
import {
  DEFAULT_STREAM_TTL_SECONDS,
  MAX_STREAM_TTL_SECONDS,
  signMediaToken,
  streamTtl,
  verifyMediaToken,
} from "./field-media-token.ts";

test("folders follow the field sheet: Vente or Location, then Quartier - Propriétaire", () => {
  assert.equal(driveTopFolder("vendre"), "Vente");
  assert.equal(driveTopFolder("louer"), "Location");
  assert.equal(driveTopFolder(null), "Location");
  assert.equal(propertyFolderName("Ouaga 2000", "Awa Ouédraogo"), "Ouaga 2000 - Awa Ouédraogo");
  assert.equal(propertyFolderName("  Tampouy ", "  Issa   Kaboré "), "Tampouy - Issa Kaboré");
  assert.equal(propertyFolderName("Zone 1/Patte d'oie", "A/B"), "Zone 1 Patte d'oie - A B");
  assert.equal(propertyFolderName(null, "Issa"), "Sans quartier - Issa");
  assert.equal(propertyFolderName("Gounghin", ""), "Gounghin - Propriétaire inconnu");
});

test("an existing folder is reused despite accents, case and dash style", () => {
  assert.equal(folderKey("Ouaga 2000 – Awa OUEDRAOGO"), folderKey("ouaga 2000 - Awa Ouédraogo"));
  assert.equal(folderKey("Tampouy-Issa"), folderKey("Tampouy - Issa"));
  const folders = [
    { id: "new", name: "ouaga 2000 – awa ouedraogo", createdTime: "2026-10-12T10:00:00Z" },
    { id: "old", name: "Ouaga 2000 - Awa Ouédraogo", createdTime: "2026-09-01T10:00:00Z" },
    { id: "other", name: "Ouaga 2000 - Moussa", createdTime: "2026-08-01T10:00:00Z" },
  ];
  assert.equal(findFolderMatch(folders, "Ouaga 2000 - Awa Ouédraogo")?.id, "old");
  assert.equal(findFolderMatch(folders, "Pissy - Awa"), null);
  assert.equal(driveQueryValue("Patte d'oie \\ x"), "Patte d\\'oie \\\\ x");
});

test("photos and videos are recognised, even when iOS sends no MIME type", () => {
  assert.equal(fieldMediaKind("video/quicktime", "IMG_0001.MOV"), "video");
  assert.equal(fieldMediaKind("", "IMG_0002.HEIC"), "photo");
  assert.equal(fieldMediaKind("", "clip.mp4"), "video");
  assert.equal(fieldMediaKind("application/pdf", "titre.pdf"), null);
  assert.equal(fieldMediaMimeType("", "IMG_0001.MOV"), "video/quicktime");
  assert.equal(fieldMediaMimeType("", "IMG_0002.heic"), "image/heic");
  assert.equal(fieldMediaMimeType("image/jpeg", "x.jpg"), "image/jpeg");
  assert.equal(cleanFileName("C:\\fakepath\\IMG 1.jpg"), "IMG 1.jpg");
  assert.equal(cleanFileName("   "), "fichier");
});

test("upload requests are validated before a Drive session is opened", () => {
  const ok = checkUploadRequest({ fileName: "visite.mov", mimeType: "", sizeBytes: 850_000_000, durationSeconds: 92.456 });
  assert.equal(ok.ok, true);
  assert.equal(ok.kind, "video");
  assert.equal(ok.mimeType, "video/quicktime");
  assert.equal(ok.durationSeconds, 92.46);
  const photo = checkUploadRequest({ fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 3_000_000, durationSeconds: 5 });
  assert.equal(photo.ok && photo.durationSeconds, null);
  assert.equal(checkUploadRequest({ fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 10 }).ok, false);
  assert.equal(checkUploadRequest({ fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 0 }).ok, false);
  assert.equal(checkUploadRequest({ fileName: "a.mp4", mimeType: "video/mp4", sizeBytes: 6 * 1024 ** 3 }).ok, false);
  assert.equal(checkUploadRequest({ fileName: "", sizeBytes: 10 }).ok, false);
});

test("stream tokens open one file until they expire", () => {
  const secret = "test-secret";
  const now = 1_800_000_000;
  const exp = now + DEFAULT_STREAM_TTL_SECONDS;
  const token = signMediaToken(secret, "media-1", exp);
  assert.equal(verifyMediaToken(secret, "media-1", String(exp), token, now), true);
  assert.equal(verifyMediaToken(secret, "media-2", String(exp), token, now), false, "other file");
  assert.equal(verifyMediaToken(secret, "media-1", String(exp + 1), token, now), false, "extended expiry");
  assert.equal(verifyMediaToken(secret, "media-1", String(exp), token, exp + 1), false, "expired");
  assert.equal(verifyMediaToken("other-secret", "media-1", String(exp), token, now), false, "other key");
  assert.equal(verifyMediaToken(secret, "media-1", String(exp), token.slice(1), now), false, "truncated");
  assert.equal(verifyMediaToken(secret, "media-1", "abc", token, now), false);
  assert.equal(verifyMediaToken(secret, "media-1", String(exp), null, now), false);
  const far = now + MAX_STREAM_TTL_SECONDS + 3600;
  assert.equal(verifyMediaToken(secret, "media-1", String(far), signMediaToken(secret, "media-1", far), now), false, "too long");
  assert.equal(streamTtl(), DEFAULT_STREAM_TTL_SECONDS);
  assert.equal(streamTtl(10), 60);
  assert.equal(streamTtl(10 ** 9), MAX_STREAM_TTL_SECONDS);
  assert.match(token, /^[A-Za-z0-9_-]+$/, "URL-safe");
});

test("chunks are multiples of 256 KiB and resume from Google's Range", () => {
  assert.equal(DIRECT_CHUNK_BYTES % (256 * 1024), 0);
  assert.equal(PROXY_CHUNK_BYTES % (256 * 1024), 0);
  assert.ok(PROXY_CHUNK_BYTES < 4.5 * 1000 * 1000, "relay chunks stay under Vercel's body limit");
  assert.deepEqual(chunkAt(0, 10, DIRECT_CHUNK_BYTES), { end: 10, contentRange: "bytes 0-9/10" });
  const size = 40 * 1024 * 1024;
  assert.deepEqual(chunkAt(DIRECT_CHUNK_BYTES, size, DIRECT_CHUNK_BYTES), {
    end: 2 * DIRECT_CHUNK_BYTES,
    contentRange: `bytes ${DIRECT_CHUNK_BYTES}-${2 * DIRECT_CHUNK_BYTES - 1}/${size}`,
  });
  assert.throws(() => chunkAt(0, size, 1000));
  assert.equal(nextOffsetFromRange("bytes=0-16777215"), 16777216);
  assert.equal(nextOffsetFromRange(null), 0);
});

test("a file is ready only if Drive has it, in the folder, at the right size", () => {
  const expected = { sizeBytes: 1234, folderId: "folder-1" };
  assert.deepEqual(checkFinalizedFile(expected, { id: "f", size: "1234", parents: ["folder-1"] }), { ok: true });
  assert.equal(checkFinalizedFile(expected, null).ok, false);
  assert.equal(checkFinalizedFile(expected, { id: "f", size: "1233", parents: ["folder-1"] }).ok, false);
  assert.equal(checkFinalizedFile(expected, { id: "f", size: null, parents: ["folder-1"] }).ok, false);
  assert.equal(checkFinalizedFile(expected, { id: "f", size: "1234", parents: ["elsewhere"] }).ok, false);
  assert.equal(checkFinalizedFile(expected, { id: "f", size: "1234", parents: ["folder-1"], trashed: true }).ok, false);
  const refused = checkFinalizedFile(expected, { id: "f", size: "99", parents: ["folder-1"] });
  assert.match(refused.reason, /99 octets au lieu de 1234/);
});

test("sizes read like the team writes them", () => {
  assert.equal(formatBytes(850 * 1024 * 1024), "850 Mo");
  assert.match(formatBytes(1.2 * 1024 ** 3), /^1,2 Go$/);
  assert.equal(formatBytes(512), "512 octets");
});

test("field visit sheet: kinds allowed per deliverable", () => {
  const insv = { fileName: "VID_20261014_trajet.insv", mimeType: "", sizeBytes: 1024 };
  assert.equal(checkUploadRequest(insv).ok, false);
  const asFile = checkUploadRequest(insv, { allowedKinds: ["video", "file"] });
  assert.equal(asFile.ok && asFile.kind, "file");
  assert.equal(asFile.ok && asFile.mimeType, "application/octet-stream");
  const photoAsVideo = checkUploadRequest({ fileName: "IMG_1.jpg", mimeType: "image/jpeg", sizeBytes: 10 }, { allowedKinds: ["video"] });
  assert.equal(photoAsVideo.ok, false);
  assert.match(photoAsVideo.reason, /seules les vidéos/);
});
