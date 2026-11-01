/** One consistent Glint voice: providers synth reply sentences to PCM audio. */
export type VoiceSample = {
  samples: Float32Array;
  sampleRate: number;
  timing?: { queueMs: number; generationMs: number };
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
export function serializeVoice(
  voice: GlintVoice,
  { timeoutMs = 8000, cooldownMs = 15000 } = {},
): GlintVoice {
  let tail: Promise<unknown> = Promise.resolve();
  let unavailableUntil = 0;
  return {
    name: voice.name,
    sampleRate: voice.sampleRate,
    ...(voice.close ? { close: () => voice.close!() } : {}),
    synth(text: string, signal?: AbortSignal): Promise<VoiceSample> {
      if (signal?.aborted) return Promise.reject(signal.reason);
      if (Date.now() < unavailableUntil)
        return Promise.reject(Error("Neural voice cooling down; use device speech."));
      const queuedAt = performance.now();
      let generationStarted: number | undefined;
      const controller = new AbortController();
      return new Promise<VoiceSample>((resolve, reject) => {
        let settled = false;
        const finish = (error?: unknown, audio?: VoiceSample) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          if (error !== undefined) reject(error);
          else resolve(audio!);
        };
        const abort = () => {
          controller.abort(signal?.reason);
          finish(signal?.reason ?? Error("Speech canceled."));
        };
        const expire = () => {
          // A queued caller has not exercised the engine: only an active
          // generation failure should put every caller into cooldown.
          if (generationStarted !== undefined)
            unavailableUntil = Date.now() + cooldownMs;
          controller.abort(Error("Neural voice deadline exceeded."));
          console.info(`[glint-voice] neural voice deadline exceeded; device fallback cooldownMs=${generationStarted === undefined ? 0 : cooldownMs}`);
          const now = performance.now();
          console.info(`[glint-timing] ${JSON.stringify({ scope: "server", lane: "tts-timeout", queueMs: Math.round((generationStarted ?? now) - queuedAt), generationMs: generationStarted === undefined ? 0 : Math.round(now - generationStarted) })}`);
          finish(controller.signal.reason);
        };
        let timer = setTimeout(expire, timeoutMs);
        signal?.addEventListener("abort", abort, { once: true });
        const run = async () => {
          controller.signal.throwIfAborted();
          if (Date.now() < unavailableUntil) throw Error("Neural voice cooling down.");
          const started = performance.now();
          generationStarted = started;
          clearTimeout(timer);
          timer = setTimeout(expire, timeoutMs);
          const audio = await voice.synth(text, controller.signal);
          controller.signal.throwIfAborted();
          finish(undefined, {
            ...audio,
            timing: {
              queueMs: Math.round(started - queuedAt),
              generationMs: Math.round(performance.now() - started),
            },
          });
        };
        // Keep the native lane occupied until it actually stops. Rejecting
        // the caller must never start overlapping CPU jobs.
        tail = tail.then(run, run).catch(error => finish(error));
      });
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
