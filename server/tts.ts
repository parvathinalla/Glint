/** One consistent Glint voice: providers synth reply sentences to PCM audio. */
export type VoiceSample = {
  samples: Float32Array;
  sampleRate: number;
};
export type GlintVoice = {
  name: string;
  sampleRate: number;
  synth(text: string, signal?: AbortSignal): Promise<VoiceSample>;
  close?(): void;
};
/**
 * Serialize one voice across requests. Native synth is CPU-bound, so
 * overlapping calls slow each other into a spiral (observed: 3.3 s
 * growing to 10.6 s per sentence under barge churn); one FIFO lane
 * keeps every synth at its solo speed. Failures never poison the lane.
 */
export function serializeVoice(voice: GlintVoice): GlintVoice {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    name: voice.name,
    sampleRate: voice.sampleRate,
    ...(voice.close ? { close: () => voice.close!() } : {}),
    synth(text: string, signal?: AbortSignal): Promise<VoiceSample> {
      const run = () => {
        signal?.throwIfAborted();
        return voice.synth(text, signal);
      };
      const next = tail.then(run, run);
      tail = next.catch(() => {});
      return next;
    },
  };
}
/** Deterministic sine blips for tests and offline development. */
export class MockVoice implements GlintVoice {
  name = "mock";
  sampleRate = 24000;
  async synth(text: string): Promise<VoiceSample> {
    const seconds = Math.min(4, Math.max(0.2, text.length * 0.05));
    const length = Math.round(seconds * this.sampleRate);
    const samples = new Float32Array(length);
    let hash = 0;
    for (let i = 0; i < text.length; i++)
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    const freq = 440 + (hash % 220);
    const fade = Math.round(0.01 * this.sampleRate);
    for (let i = 0; i < length; i++) {
      const envelope = Math.min(1, i / fade, (length - 1 - i) / fade);
      samples[i] =
        0.5 *
        envelope *
        Math.sin((2 * Math.PI * freq * i) / this.sampleRate);
    }
    return { samples, sampleRate: this.sampleRate };
  }
}
