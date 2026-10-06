// Minimal WAV helpers. The browser records in whatever format the device
// gives (iPhones give MP4/AAC, which Cartesia's clone endpoint does not
// accept), so the Studio converts the recording to 16-bit mono WAV before
// uploading. The server uses the header reader to check the clip length.

export const CLONE_SAMPLE_RATE = 24000;
export const MIN_CLONE_SECONDS = 10;
export const MAX_CLONE_SECONDS = 60;

/** Encodes mono float samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeText(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }
  return buffer;
}

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationSeconds: number;
};

/** Reads a canonical PCM WAV header. Returns null if it is not a WAV. */
export function readWavInfo(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  if (text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE") return null;

  // Walk the chunks to find "fmt " and "data".
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = -1;
  while (offset + 8 <= bytes.length) {
    const id = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 8 + 16 <= bytes.length) {
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (id === "data") {
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!sampleRate || !channels || !bitsPerSample || dataSize < 0) return null;

  const bytesPerFrame = channels * (bitsPerSample / 8);
  // Trust the real byte count if the header size is larger than the file.
  const available = Math.min(dataSize, bytes.length - offset - 8);
  return {
    sampleRate,
    channels,
    bitsPerSample,
    durationSeconds: available / bytesPerFrame / sampleRate,
  };
}
