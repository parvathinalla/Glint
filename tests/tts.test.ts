import { expect, it, vi } from "vitest";
import {
  serializeVoice,
  type GlintVoice,
  type VoiceSample,
} from "../server/tts.ts";

it("gives queued sentences their full generation budget", async () => {
  vi.useFakeTimers();
  try {
    const voice = serializeVoice({name:"cpu", sampleRate:24000, async synth() {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return {samples:new Float32Array(1),sampleRate:24000};
    }}, {timeoutMs:4000});
    const first = voice.synth("first");
    const second = voice.synth("second");
    const results = Promise.all([first,second]);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await results).toHaveLength(2);
  } finally { vi.useRealTimers(); }
});

it("times out a stuck native job, bypasses it during cooldown, and never overlaps jobs", async () => {
  vi.useFakeTimers();
  try {
    let release!: () => void;
    let calls = 0;
    let nativeSignal: AbortSignal | undefined;
    const voice = serializeVoice({ name: "slow", sampleRate: 24000, async synth(_text, signal) {
      calls++;
      nativeSignal = signal;
      if (calls === 1) await new Promise<void>(resolve => { release = resolve; });
      return { samples: new Float32Array(10), sampleRate: 24000 };
    } }, { timeoutMs: 4000, cooldownMs: 60000 });
    const first = voice.synth("Slow sentence.");
    const failure = expect(first).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(4000);
    await failure;
    expect(nativeSignal?.aborted).toBe(true);
    await expect(voice.synth("New reply.")).rejects.toThrow("cooling down");
    expect(calls).toBe(1);
    release();
    await vi.advanceTimersByTimeAsync(60000);
    const recovered = await voice.synth("Recovered.");
    expect(calls).toBe(2);
    expect(recovered.timing).toMatchObject({ queueMs: expect.any(Number), generationMs: expect.any(Number) });
  } finally { vi.useRealTimers(); }
});

it("rejects canceled callers immediately without releasing an unfinished native lane", async () => {
  let release!: () => void;
  const calls: string[] = [];
  const voice = serializeVoice({ name: "test", sampleRate: 24000, async synth(text) {
    calls.push(text);
    if (text === "old") await new Promise<void>(resolve => { release = resolve; });
    return { samples: new Float32Array(1), sampleRate: 24000 };
  } });
  const controller = new AbortController();
  const old = voice.synth("old", controller.signal);
  await Promise.resolve();
  controller.abort();
  await expect(old).rejects.toThrow();
  const next = voice.synth("next");
  await Promise.resolve();
  expect(calls).toEqual(["old"]);
  release();
  await next;
  expect(calls).toEqual(["old", "next"]);
});

it("skips canceled synthesis waiting behind an active sentence", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  const voice = serializeVoice({ name: "test", sampleRate: 24000, async synth(text) {
    calls.push(text);
    if (text === "first") await gate;
    return { samples: new Float32Array(10), sampleRate: 24000 };
  } });
  const first = voice.synth("first");
  const controller = new AbortController();
  const second = voice.synth("obsolete", controller.signal);
  const rejected = expect(second).rejects.toThrow();
  controller.abort();
  release();
  await first;
  await rejected;
  await voice.synth("new reply");
  expect(calls).toEqual(["first", "new reply"]);
});

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
