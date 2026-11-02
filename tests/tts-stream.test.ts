import { expect, it } from "vitest";
import { MockVoice, type GlintVoice } from "../server/tts.ts";
import { TtsStream, type TtsEvent } from "../server/tts-stream.ts";

class ScriptedVoice implements GlintVoice {
  name = "scripted";
  sampleRate = 24000;
  texts: string[] = [];
  constructor(private behavior: (text: string) => Float32Array | Error) {}
  async synth(text: string) {
    this.texts.push(text);
    const out = this.behavior(text);
    if (out instanceof Error) throw out;
    return { samples: out, sampleRate: this.sampleRate };
  }
}
const tone = (seconds: number) =>
  new Float32Array(Math.round(seconds * 24000)).fill(0.1);

it("emits streaming audio before synthesis finishes, with unique sequences and no duplicate sentence",async()=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  const events:TtsEvent[]=[];
  const voice:GlintVoice={name:"cloud",sampleRate:24000,streaming:true,async synth(text,signal,onAudio){
    onAudio!(tone(0.1),24000);await gate;signal?.throwIfAborted();onAudio!(tone(0.1),24000);return {samples:new Float32Array(),sampleRate:24000};
  }};
  const stream=new TtsStream(voice,event=>events.push(event));stream.push("Hello there.");const done=stream.finish();
  await Promise.resolve();expect(events.filter(e=>e.type==="audio")).toHaveLength(1);
  release();await done;
  const audio=events.filter(e=>e.type==="audio");expect(audio.map(e=>e.seq)).toEqual([0,1]);expect(audio.map(e=>e.text)).toEqual(["Hello there.",""]);
});
it("does not replay partially emitted speech through device fallback or emit chunks after cancellation",async()=>{
  const events:TtsEvent[]=[];let cancel:(()=>void)|undefined=undefined;
  const voice:GlintVoice={name:"cloud",sampleRate:24000,streaming:true,async synth(_text,_signal,onAudio){onAudio!(tone(0.1),24000);cancel?.();onAudio!(tone(0.1),24000);throw Error("provider disconnected");}};
  const stream=new TtsStream(voice,event=>events.push(event));stream.push("Hello there.");await stream.finish();
  expect(events.find(e=>e.type==="audio-error")).toMatchObject({text:""});
  events.length=0;const canceled=new TtsStream(voice,event=>events.push(event));cancel=()=>canceled.cancel();canceled.push("Hello there.");await canceled.finish();
  expect(events.filter(e=>e.type==="audio")).toHaveLength(1);expect(events.some(e=>e.type==="audio-error")).toBe(false);
});

it("routes Telugu to device speech without invoking the English Kokoro lexicon", async () => {
  const voice = new ScriptedVoice(() => tone(0.5));
  voice.name = "kokoro-af-heart";
  const events: TtsEvent[] = [];
  const stream = new TtsStream(voice, event => events.push(event));
  stream.push("నమస్కారం. ");
  await stream.finish();
  expect(voice.texts).toEqual([]);
  expect(events).toEqual([{ type: "audio-error", seq: 0, text: "నమస్కారం." }]);
});

it("announces the neural voice before any audio", async () => {
  const events: TtsEvent[] = [];
  const stream = new TtsStream(new MockVoice(), (event) => events.push(event));
  stream.announce();
  expect(events).toEqual([
    { type: "voice", mode: "neural", sampleRate: 24000, voice: "mock" },
  ]);
  await stream.finish();
});

it("emits ordered audio with base64 PCM16 per sentence", async () => {
  const events: TtsEvent[] = [];
  const stream = new TtsStream(
    new ScriptedVoice(() => tone(0.5)),
    (event) => events.push(event),
  );
  stream.announce();
  stream.push("I can see you. ");
  stream.push("Are you ready? Yes! ");
  await stream.finish();
  const audio = events.filter((event) => event.type === "audio");
  expect(audio.map((event) => (event as { text: string }).text)).toEqual([
    "I can see you.",
    "Are you ready?",
    "Yes!",
  ]);
  expect(audio.map((event) => (event as { seq: number }).seq)).toEqual([
    0, 1, 2,
  ]);
  for (const event of audio) {
    const { pcm, sampleRate } = event as {
      pcm: string;
      sampleRate: number;
    };
    expect(sampleRate).toBe(24000);
    expect(Buffer.from(pcm, "base64").length).toBe(12000 * 2);
  }
});

it("cleans markdown before synthesis and skips empties without a seq", async () => {
  const events: TtsEvent[] = [];
  const voice = new ScriptedVoice(() => tone(0.1));
  const stream = new TtsStream(voice, (event) => events.push(event));
  stream.push("See [this](https://example.com) **now**.\n\n   \nNext. ");
  await stream.finish();
  expect(voice.texts).toEqual(["See this now.", "Next."]);
  expect(
    events
      .filter((event) => event.type === "audio")
      .map((event) => (event as { seq: number }).seq),
  ).toEqual([0, 1]);
});

it("uses device speech for the rest of a reply after synthesis fails", async () => {
  const events: TtsEvent[] = [];
  let calls = 0;
  const stream = new TtsStream(
    new ScriptedVoice(() => (++calls === 2 ? Error("boom") : tone(0.1))),
    (event) => events.push(event),
  );
  stream.push("First. Second. Third. ");
  await stream.finish();
  expect(events.map((event) => event.type)).toEqual([
    "audio",
    "audio-error",
    "audio-error",
  ]);
  expect(events[1]).toMatchObject({ type: "audio-error", seq: 1 });
  expect((events[2] as { text: string }).text).toBe("Third.");
});

it("cancel drops pending and in-flight audio", async () => {
  const events: TtsEvent[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  // Occupy the queue with a gated first sentence, then queue a second.
  const gated = new TtsStream(
    {
      name: "gated",
      sampleRate: 24000,
      async synth(text: string) {
        if (text.startsWith("First")) await gate;
        return { samples: tone(0.1), sampleRate: 24000 };
      },
    },
    (event) => events.push(event),
  );
  gated.push("First. Second. ");
  await Promise.resolve();
  gated.cancel();
  release();
  await gated.finish();
  expect(events).toEqual([]);
});

it("reports synth timing per sentence", async () => {
  const timings: Array<{ ms: number; chars: number }> = [];
  const stream = new TtsStream(
    new ScriptedVoice(() => tone(0.1)),
    () => {},
    { onTiming: (ms, chars) => timings.push({ ms, chars }) },
  );
  stream.push("Hello there. ");
  await stream.finish();
  expect(timings).toHaveLength(1);
  expect(timings[0].chars).toBe("Hello there.".length);
  expect(timings[0].ms).toBeGreaterThanOrEqual(0);
});

it("MockVoice synths deterministic audio sized by text", async () => {
  const voice = new MockVoice();
  const short = await voice.synth("Hi.");
  const long = await voice.synth("Hello there, friend.");
  const again = await voice.synth("Hi.");
  expect(short.sampleRate).toBe(24000);
  expect(long.samples.length).toBeGreaterThan(short.samples.length);
  expect(again.samples).toEqual(short.samples);
  expect(Math.max(...Array.from(short.samples.slice(0, 24)))).toBeLessThan(
    0.05,
  );
});
