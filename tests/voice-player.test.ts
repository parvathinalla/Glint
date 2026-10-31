import { afterEach, expect, it, vi } from "vitest";
import { VoicePlayer, isNeuralVoiceEnabled } from "../src/voice-player.ts";

type FakeSource = {
  onended: (() => void) | null;
  started: boolean;
  stopped: boolean;
  start: () => void;
  stop: () => void;
  connect: () => void;
  buffer: unknown;
};
function pcmBase64(samples: number): string {
  const bytes = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i++) bytes[i * 2 + 1] = 64;
  return Buffer.from(bytes).toString("base64");
}
function stage() {
  const sources: FakeSource[] = [];
  const contexts: { resumed: number; state: string }[] = [];
  const events: Array<{ seq: number; text: string }> = [];
  const utterances: { text: string; onend: () => void }[] = [];
  const changed: boolean[] = [];
  const said: string[] = [];
  const makeSource = (): FakeSource => ({
    onended: null,
    started: false,
    stopped: false,
    buffer: null,
    connect() {},
    start() {
      this.started = true;
    },
    stop() {
      this.stopped = true;
    },
  });
  vi.stubGlobal("window", {
    AudioContext: class {
      destination = {};
      state = "suspended";
      resumed = 0;
      constructor() {
        contexts.push(this);
      }
      createBuffer(_channels: number, length: number, _rate: number) {
        return { length, copyToChannel() {} };
      }
      createBufferSource() {
        const source = makeSource();
        sources.push(source);
        return source;
      }
      async resume() {
        this.resumed++;
        this.state = "running";
      }
    },
    dispatchEvent: (event: { detail: { seq: number; text: string } }) => {
      events.push(event.detail);
    },
    speechSynthesis: {
      speak: (utterance: { text: string; onend: () => void }) => {
        // Audible replies only: the silent unlock utterance is not speech.
        if (utterance.text.trim()) utterances.push(utterance);
      },
      cancel: () => {},
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  const player = new VoicePlayer(
    (value) => changed.push(value),
    (text) => said.push(text),
  );
  return { sources, contexts, events, utterances, changed, said, player };
}
afterEach(() => vi.unstubAllGlobals());

it("plays sentences in order and reports speaking transitions", () => {
  const { player, sources, changed, said } = stage();
  player.unlock();
  player.playAudio({ seq: 0, text: "Hello.", pcm: pcmBase64(240), sampleRate: 24000 });
  player.playAudio({ seq: 1, text: "Ready?", pcm: pcmBase64(240), sampleRate: 24000 });
  expect(sources).toHaveLength(1);
  expect(changed).toEqual([true]);
  expect(said).toEqual(["Hello."]);
  sources[0].onended!();
  expect(sources).toHaveLength(2);
  expect(said).toEqual(["Hello.", "Ready?"]);
  sources[1].onended!();
  expect(changed).toEqual([true, false]);
});

it("announces each sentence for tests and tooling", () => {
  const { player, events } = stage();
  player.unlock();
  player.playAudio({ seq: 0, text: "Hello.", pcm: pcmBase64(120), sampleRate: 24000 });
  expect(events).toEqual([{ seq: 0, text: "Hello." }]);
});

it("ignores duplicate audio but accepts the next reply after finish", () => {
  const { player, sources } = stage();
  player.unlock();
  player.playAudio({ seq: 0, text: "Hello.", pcm: pcmBase64(120), sampleRate: 24000 });
  player.playAudio({ seq: 0, text: "Hello.", pcm: pcmBase64(120), sampleRate: 24000 });
  expect(sources).toHaveLength(1);
  sources[0].onended!();
  player.finish();
  player.playAudio({ seq: 0, text: "Again.", pcm: pcmBase64(120), sampleRate: 24000 });
  expect(sources).toHaveLength(2);
});

it("cancel stops audio, drops the queue, and ignores the stale end", () => {
  const { player, sources, changed } = stage();
  player.unlock();
  player.playAudio({ seq: 0, text: "Hello.", pcm: pcmBase64(120), sampleRate: 24000 });
  player.playAudio({ seq: 1, text: "Ready?", pcm: pcmBase64(120), sampleRate: 24000 });
  player.cancel();
  expect(sources[0].stopped).toBe(true);
  expect(changed.at(-1)).toBe(false);
  sources[0].onended!();
  expect(sources).toHaveLength(1);
});

it("soft-stop halts audio and resume continues the queue silently", () => {
  const { player, sources, changed } = stage();
  player.unlock();
  player.playAudio({ seq: 0, text: "Hello.", pcm: pcmBase64(120), sampleRate: 24000 });
  player.playAudio({ seq: 1, text: "Ready?", pcm: pcmBase64(120), sampleRate: 24000 });
  player.softStop();
  expect(sources[0].stopped).toBe(true);
  expect(changed).toEqual([true]);
  player.resume();
  expect(sources).toHaveLength(2);
  sources[1].onended!();
  expect(changed).toEqual([true, false]);
});

it("failed sentences fall back to device speech in order", () => {
  const { player, utterances, said } = stage();
  player.unlock();
  player.audioError("First.");
  expect(utterances.map((x) => x.text)).toEqual(["First."]);
  expect(said).toEqual(["First."]);
  utterances[0].onend();
  player.audioError("Second.");
  expect(utterances.map((x) => x.text)).toEqual(["First.", "Second."]);
});

it("corrupt audio falls back to device speech", () => {
  const { player, utterances, sources } = stage();
  player.unlock();
  player.playAudio({ seq: 0, text: "Hello.", pcm: "!!!", sampleRate: 24000 });
  expect(sources).toHaveLength(0);
  expect(utterances.map((x) => x.text)).toEqual(["Hello."]);
});

it("unlock resumes the audio context for gesture-locked browsers", () => {
  const { player, contexts } = stage();
  player.unlock();
  expect(contexts).toHaveLength(1);
  expect(contexts[0].resumed).toBe(1);
  player.unlock();
  expect(contexts).toHaveLength(1);
});

it("resumes a suspended context when audio arrives", () => {
  const { player, contexts } = stage();
  player.unlock();
  expect(contexts).toHaveLength(1);
  contexts[0].state = "suspended";
  const resumed = contexts[0].resumed;
  player.playAudio({ seq: 0, text: "Hello.", pcm: pcmBase64(120), sampleRate: 24000 });
  expect(contexts[0].resumed).toBe(resumed + 1);
});

it("reports playback state for the on-screen voice note", () => {
  const { player } = stage();
  expect(player.getState()).toMatchObject({ ctx: "missing" });
  player.unlock();
  expect(player.getState()).toMatchObject({
    ctx: "running",
    queued: 0,
    active: false,
    lastSeq: -1,
    fallback: 0,
  });
  player.playAudio({ seq: 0, text: "Hello.", pcm: pcmBase64(120), sampleRate: 24000 });
  expect(player.getState()).toMatchObject({ active: true, lastSeq: 0 });
  player.audioError("Next.");
  expect(player.getState()).toMatchObject({ fallback: 1 });
});

it("the neural voice kill switch reads live from localStorage", () => {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  });
  expect(isNeuralVoiceEnabled()).toBe(true);
  store["glint-neural-voice"] = "0";
  expect(isNeuralVoiceEnabled()).toBe(false);
});
