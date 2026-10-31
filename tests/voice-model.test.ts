import { describe, expect, it } from "vitest";
import {
  KOKORO_SAMPLE_RATE,
  SherpaKokoroVoice,
  getServerVoice,
  kokoroFilesPresent,
  resetServerVoiceForTests,
  ttsModelDir,
} from "../server/tts-kokoro.ts";
import {
  KITTEN_SAMPLE_RATE,
  SherpaKittenVoice,
  kittenFilesPresent,
  kittenModelDir,
} from "../server/tts-kitten.ts";
/**
 * Real-model characterization: pins the Kokoro int8 voice's output
 * (24 kHz, plausible speech rate and healthy levels) against weights
 * or runtime regressions. Slow (~10 s with load); skipped when
 * prepare-tts.mjs has not fetched the model.
 */
const haveModel = kokoroFilesPresent();
if (!haveModel) console.log(`tts model test skipped: no model in ${ttsModelDir()}`);
describe.skipIf(!haveModel)("real TTS model behavior", () => {
  it(
    "synths a Glint reply sentence with healthy signal",
    async () => {
      const voice = new SherpaKokoroVoice();
      const audio = await voice.synth(
        "For soft everyday wear, those clear thin frames are already perfect on you.",
      );
      expect(audio.sampleRate).toBe(KOKORO_SAMPLE_RATE);
      const seconds = audio.samples.length / audio.sampleRate;
      expect(seconds).toBeGreaterThan(1.5);
      expect(seconds).toBeLessThan(10);
      let peak = 0,
        sum = 0;
      for (const sample of audio.samples) {
        peak = Math.max(peak, Math.abs(sample));
        sum += sample * sample;
      }
      expect(peak).toBeGreaterThan(0.05);
      expect(peak).toBeLessThanOrEqual(1);
      expect(Math.sqrt(sum / audio.samples.length)).toBeGreaterThan(0.005);
    },
    120000,
  );
});
const haveKitten = kittenFilesPresent();
if (!haveKitten)
  console.log(`kitten voice test skipped: no model in ${kittenModelDir()}`);
describe.skipIf(!haveKitten)("real Kitten model behavior", () => {
  it(
    "synths a Glint reply sentence with healthy signal",
    async () => {
      const voice = new SherpaKittenVoice();
      const audio = await voice.synth(
        "For soft everyday wear, those clear thin frames are already perfect on you.",
      );
      expect(audio.sampleRate).toBe(KITTEN_SAMPLE_RATE);
      const seconds = audio.samples.length / audio.sampleRate;
      expect(seconds).toBeGreaterThan(1.5);
      expect(seconds).toBeLessThan(10);
      let peak = 0,
        sum = 0;
      for (const sample of audio.samples) {
        peak = Math.max(peak, Math.abs(sample));
        sum += sample * sample;
      }
      expect(peak).toBeGreaterThan(0.05);
      expect(peak).toBeLessThanOrEqual(1);
      expect(Math.sqrt(sum / audio.samples.length)).toBeGreaterThan(0.005);
    },
    120000,
  );
  it(
    "prefers Kitten over the Kokoro fallback",
    async () => {
      resetServerVoiceForTests();
      try {
        const voice = await getServerVoice();
        expect(voice?.name).toBe("kitten-nano");
      } finally {
        resetServerVoiceForTests();
      }
    },
    120000,
  );
});
