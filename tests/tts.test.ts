import { expect, it } from "vitest";
import {
  serializeVoice,
  type GlintVoice,
  type VoiceSample,
} from "../server/tts.ts";

it("serializes concurrent synths FIFO without overlap", async () => {
  let active = 0,
    maxActive = 0;
  const order: string[] = [];
  const inner: GlintVoice = {
    name: "inner",
    sampleRate: 24000,
    async synth(text: string): Promise<VoiceSample> {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(text);
      active--;
      return { samples: new Float32Array(240), sampleRate: 24000 };
    },
  };
  const voice = serializeVoice(inner);
  const results = await Promise.all([
    voice.synth("a"),
    voice.synth("b"),
    voice.synth("c"),
  ]);
  expect(maxActive).toBe(1);
  expect(order).toEqual(["a", "b", "c"]);
  expect(results).toHaveLength(3);
  expect(voice.name).toBe("inner");
  expect(voice.sampleRate).toBe(24000);
});

it("a failed synth does not poison later ones", async () => {
  let calls = 0;
  const voice = serializeVoice({
    name: "flaky",
    sampleRate: 24000,
    async synth(_text: string): Promise<VoiceSample> {
      calls++;
      if (calls === 1) throw Error("boom");
      return { samples: new Float32Array(10), sampleRate: 24000 };
    },
  });
  await expect(voice.synth("first")).rejects.toThrow("boom");
  const audio = await voice.synth("second");
  expect(audio.samples).toHaveLength(10);
});
