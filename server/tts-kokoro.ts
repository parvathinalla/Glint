import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { GlintVoice, VoiceSample } from "./tts.ts";
import { MockVoice, serializeVoice } from "./tts.ts";
/** af_heart in the sherpa Kokoro multi-lang speaker map (0-52). */
export const KOKORO_VOICE_ID = 3;
export const KOKORO_SAMPLE_RATE = 24000;
const KOKORO_FILES = [
  "model.int8.onnx",
  "voices.bin",
  "tokens.txt",
  "lexicon-us-en.txt",
];
export function ttsModelDir(
  dataDir: string = process.env.GLINT_DATA_DIR ?? ".data",
): string {
  return resolve(dataDir, "tts");
}
export function kokoroFilesPresent(dir: string = ttsModelDir()): boolean {
  return KOKORO_FILES.every((file) => existsSync(resolve(dir, file)));
}
type SherpaModule = {
  OfflineTts: {
    createAsync(config: unknown): Promise<SherpaTts>;
  };
  GenerationConfig: new (options: {
    sid: number;
    speed: number;
  }) => unknown;
};
type SherpaTts = {
  generateAsync(request: {
    text: string;
    generationConfig: unknown;
    onProgress?: (info: { samples: Float32Array; progress: number }) => number;
  }): Promise<{ samples: ArrayLike<number>; sampleRate: number }>;
};
/** Kokoro int8 through the sherpa native binding; non-blocking synth. */
export class SherpaKokoroVoice implements GlintVoice {
  name = "kokoro-af-heart";
  sampleRate = KOKORO_SAMPLE_RATE;
  private ready: Promise<{ tts: SherpaTts; config: SherpaModule }>;
  constructor(
    private dir: string = ttsModelDir(),
    private sid: number = KOKORO_VOICE_ID,
  ) {
    this.ready = this.load();
  }
  private async load() {
    const sherpa = createRequire(import.meta.url)(
      "sherpa-onnx-node",
    ) as SherpaModule;
    const tts = await sherpa.OfflineTts.createAsync({
      model: {
        kokoro: {
          model: resolve(this.dir, "model.int8.onnx"),
          voices: resolve(this.dir, "voices.bin"),
          lexicon: resolve(this.dir, "lexicon-us-en.txt"),
          tokens: resolve(this.dir, "tokens.txt"),
        },
        numThreads: 2,
        provider: "cpu",
      },
      maxNumSentences: 1,
    });
    return { tts, config: sherpa };
  }
  async synth(text: string, signal?: AbortSignal): Promise<VoiceSample> {
    const { tts, config } = await this.ready;
    signal?.throwIfAborted();
    const audio = await tts.generateAsync({
      text,
      // Native synthesis checks this between generated chunks. The caller's
      // deadline handles engines that cannot stop inside a single chunk.
      onProgress: () => signal?.aborted ? 0 : 1,
      generationConfig: new config.GenerationConfig({
        sid: this.sid,
        speed: 1.0,
      }),
    });
    signal?.throwIfAborted();
    return {
      samples: Float32Array.from(audio.samples),
      sampleRate: audio.sampleRate,
    };
  }
}
let cached: GlintVoice | null | undefined;
let failedAt = 0;
let pending: Promise<GlintVoice | null> | null = null;
/**
 * The request-scoped voice: mock for tests, Kokoro when its files are
 * present, otherwise null (the reply falls back to device speech).
 * Concurrent first requests share one load; failures retry after a
 * minute so one bad model can't spam.
 */
export function getServerVoice(): Promise<GlintVoice | null> {
  if (process.env.GLINT_TTS_MOCK === "1")
    return Promise.resolve(serializeVoice(new MockVoice()));
  if (process.env.GLINT_NEURAL_VOICE === "0") return Promise.resolve(null);
  if (cached !== undefined) {
    if (cached === null && Date.now() - failedAt < 60000)
      return Promise.resolve(null);
    if (cached !== null) return Promise.resolve(cached);
  }
  if (!kokoroFilesPresent()) {
    cached = null;
    failedAt = Date.now();
    return Promise.resolve(null);
  }
  pending ??= loadVoice().finally(() => {
    pending = null;
  });
  return pending;
}
async function loadVoice(): Promise<GlintVoice | null> {
  try {
    const voice = new SherpaKokoroVoice();
    await voice.synth("Glint voice ready.");
    cached = serializeVoice(voice);
    return cached;
  } catch (error) {
    console.warn(
      `The Glint neural voice failed to load (${error instanceof Error ? error.message : error}). Replies will use device speech.`,
    );
    cached = null;
    failedAt = Date.now();
    return null;
  }
}
/** Test-only reset for the cached voice. */
export function resetServerVoiceForTests() {
  cached = undefined;
  failedAt = 0;
  pending = null;
}
