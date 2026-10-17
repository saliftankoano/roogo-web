import { CLONE_SAMPLE_RATE, encodeWav } from "@/lib/studio/wav";

/**
 * Converts any recording the browser produced (WebM on Android and desktop,
 * MP4/AAC on iPhone) to a 16-bit mono WAV at 24 kHz, which is what the Studio
 * uploads. Runs in the browser only.
 */
export async function recordingToWav(recording: Blob): Promise<Blob> {
  const bytes = await recording.arrayBuffer();
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(bytes);

    // Resample to the target rate and mix down to mono in one step.
    const frames = Math.ceil(decoded.duration * CLONE_SAMPLE_RATE);
    const offline = new OfflineAudioContext(1, frames, CLONE_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();

    return new Blob([encodeWav(rendered.getChannelData(0), CLONE_SAMPLE_RATE)], {
      type: "audio/wav",
    });
  } finally {
    void context.close();
  }
}
