import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { GlintVoice, VoiceSample } from "./tts.ts";
/** First voice row in the Kitten Nano v0.2 speaker table. */
export const KITTEN_VOICE_ID = 0;
export const KITTEN_SAMPLE_RATE = 24000;
const KITTEN_FILES = [
  "model.fp16.onnx",
  "voices.bin",
  "tokens.txt",
  "lexicon-us-en.txt",
];
export function kittenModelDir(
  dataDir: string = process.env.GLINT_DATA_DIR ?? ".data",
): string {
  return resolve(dataDir, "tts-kitten");
}
export function kittenFilesPresent(dir: string = kittenModelDir()): boolean {
  return KITTEN_FILES.every((file) => existsSync(resolve(dir, file)));
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
  }): Promise<{ samples: ArrayLike<number>; sampleRate: number }>;
};
/** Kitten Nano v0.2 fp16 through the sherpa native binding. */
export class SherpaKittenVoice implements GlintVoice {
  name = "kitten-nano";
  sampleRate = KITTEN_SAMPLE_RATE;
  private ready: Promise<{ tts: SherpaTts; config: SherpaModule }>;
  constructor(
    private dir: string = kittenModelDir(),
    private sid: number = KITTEN_VOICE_ID,
  ) {
    this.ready = this.load();
  }
  private async load() {
    const sherpa = createRequire(import.meta.url)(
      "sherpa-onnx-node",
    ) as SherpaModule;
    const tts = await sherpa.OfflineTts.createAsync({
      model: {
        kitten: {
          model: resolve(this.dir, "model.fp16.onnx"),
          voices: resolve(this.dir, "voices.bin"),
          tokens: resolve(this.dir, "tokens.txt"),
          lexicon: resolve(this.dir, "lexicon-us-en.txt"),
        },
        numThreads: 2,
        provider: "cpu",
      },
      maxNumSentences: 1,
    });
    return { tts, config: sherpa };
  }
  async synth(text: string): Promise<VoiceSample> {
    const { tts, config } = await this.ready;
    const audio = await tts.generateAsync({
      text,
      generationConfig: new config.GenerationConfig({
        sid: this.sid,
        speed: 1.0,
      }),
    });
    return {
      samples: Float32Array.from(audio.samples),
      sampleRate: audio.sampleRate,
    };
  }
}
