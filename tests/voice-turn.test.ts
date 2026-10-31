import { describe, expect, it } from "vitest";
import {
  VoiceTurnDetector,
  isTurnComplete,
  isTurnContinuation,
  pcm16Bytes,
  voiceWav,
} from "../shared/voice-turn.ts";
describe("local hands-free turn boundaries", () => {
  it("does not submit silence and detects two turns without a button press", () => {
    const detector = new VoiceTurnDetector(24000);
    const quiet = new Float32Array(2400),
      speech = new Float32Array(2400).fill(0.1);
    let starts = 0,
      turns = 0;
    const push = (frame: Float32Array) => {
      const result = detector.push(frame);
      if (result.started) starts++;
      if (result.audio) turns++;
    };
    for (let i = 0; i < 100; i++) push(quiet);
    expect(turns).toBe(0);
    for (let turn = 0; turn < 2; turn++) {
      for (let i = 0; i < 7; i++) push(speech);
      for (let i = 0; i < 16; i++) push(quiet);
    }
    expect(starts).toBe(2);
    expect(turns).toBe(2);
  });
  it("reports voiced milliseconds excluding pre-roll and end silence", () => {
    const detector = new VoiceTurnDetector(24000);
    const quiet = new Float32Array(2400),
      speech = new Float32Array(2400).fill(0.1);
    const voiced: number[] = [];
    for (let i = 0; i < 30; i++) detector.push(quiet);
    for (let i = 0; i < 5; i++) detector.push(speech);
    for (let i = 0; i < 30; i++) {
      const result = detector.push(quiet);
      if (result.ended && result.voicedMs !== undefined)
        voiced.push(result.voicedMs);
    }
    expect(voiced).toHaveLength(1);
    // Five 100 ms speech frames: 500 ms voiced inside a ~1.6 s WAV window.
    expect(voiced[0]).toBeCloseTo(500, 0);
  });
  it("caps long utterances and waits for silence before rearming", () => {
    const detector = new VoiceTurnDetector(48000),
      speech = new Float32Array(4800).fill(0.1);
    const turns: Float32Array[] = [];
    for (let i = 0; i < 400; i++) {
      const result = detector.push(speech);
      if (result.audio) turns.push(result.audio);
    }
    expect(turns).toHaveLength(1);
    expect(turns[0].length).toBeLessThanOrEqual(48000 * 15);
  });
  it("produces bounded mono PCM WAV at 24 kHz from another input rate", async () => {
    const data = new DataView(
      await voiceWav(new Float32Array(48000).fill(0.1), 48000).arrayBuffer(),
    );
    expect(data.byteLength).toBe(48044);
    expect(data.getUint32(24, true)).toBe(24000);
    expect(data.getUint16(22, true)).toBe(1);
    expect(data.getUint16(34, true)).toBe(16);
  });
});
describe("streaming live frames", () => {
  it("emits nothing while idle, then pre-roll plus the start frame", () => {
    const detector = new VoiceTurnDetector(24000);
    const quiet = new Float32Array(1024),
      speech = new Float32Array(1024).fill(0.1);
    expect(detector.push(quiet).live).toEqual([]);
    let result = detector.push(quiet);
    expect(result.live).toEqual([]);
    for (let i = 0; i < 3; i++) result = detector.push(speech);
    expect(result.started).toBeUndefined();
    expect(result.live).toEqual([]);
    result = detector.push(speech);
    expect(result.started).toBe(true);
    const streamed = result.live.reduce((n, f) => n + f.length, 0);
    expect(streamed).toBeGreaterThan(1024);
    result = detector.push(speech);
    expect(result.started).toBeUndefined();
    expect(result.live).toHaveLength(1);
    expect(result.live[0]).toHaveLength(1024);
  });
  it("ends usable turns with audio and every turn with a marker", () => {
    const detector = new VoiceTurnDetector(24000);
    const speech = new Float32Array(2400).fill(0.1),
      quiet = new Float32Array(2400);
    for (let i = 0; i < 2; i++) detector.push(speech);
    let result = detector.push(quiet);
    for (let i = 0; i < 8; i++) result = detector.push(quiet);
    expect(result.audio).toBeDefined();
    expect(result.ended).toBe(true);
    expect(result.live).toHaveLength(1);
  });
  it("fires at most one turn for steady background noise, then goes quiet", () => {
    const detector = new VoiceTurnDetector(24000);
    const noise = new Float32Array(2400).fill(0.03);
    let starts = 0,
      ends = 0;
    for (let i = 0; i < 200; i++) {
      const result = detector.push(noise);
      if (result.started) starts++;
      if (result.ended) ends++;
    }
    expect(starts).toBeLessThanOrEqual(1);
    expect(ends).toBe(starts);
  });
  it("hears speech above learned noise", () => {
    const detector = new VoiceTurnDetector(24000);
    const noise = new Float32Array(2400).fill(0.03),
      speech = new Float32Array(2400).fill(0.2);
    let starts = 0;
    for (let i = 0; i < 200; i++)
      if (detector.push(noise).started) starts++;
    const before = starts;
    for (let i = 0; i < 3; i++)
      if (detector.push(speech).started) starts++;
    expect(starts).toBe(before + 1);
    let ended = false;
    for (let i = 0; i < 12 && !ended; i++)
      ended = detector.push(noise).ended === true;
    expect(ended).toBe(true);
  });
  it("lowers the floor again after noise stops", () => {
    const detector = new VoiceTurnDetector(24000);
    const noise = new Float32Array(2400).fill(0.03),
      quiet = new Float32Array(2400),
      soft = new Float32Array(2400).fill(0.02);
    for (let i = 0; i < 60; i++) detector.push(noise);
    for (let i = 0; i < 60; i++) detector.push(quiet);
    let started = false;
    for (let i = 0; i < 3 && !started; i++)
      started = detector.push(soft).started === true;
    expect(started).toBe(true);
  });
  it("ends sooner on a shorter silence window", () => {
    const detector = new VoiceTurnDetector(24000);
    const speech = new Float32Array(2400).fill(0.1),
      quiet = new Float32Array(2400);
    for (let i = 0; i < 2; i++)
      detector.push(speech, 0.014, { endSilenceMs: 500 });
    let ended = false;
    for (let i = 0; i < 5; i++)
      ended = detector.push(quiet, 0.014, { endSilenceMs: 500 }).ended === true;
    expect(ended).toBe(true);
  });
  it("extends mid-thought turns instead of cutting them", () => {
    const detector = new VoiceTurnDetector(24000);
    const speech = new Float32Array(2400).fill(0.1),
      quiet = new Float32Array(2400);
    let extensions = 0;
    const opts = {
      endSilenceMs: 500,
      shouldExtend: () => ++extensions <= 2,
    };
    for (let i = 0; i < 2; i++) detector.push(speech, 0.014, opts);
    for (let i = 0; i < 5; i++)
      expect(detector.push(quiet, 0.014, opts).ended).toBeUndefined();
    for (let i = 0; i < 5; i++)
      expect(detector.push(quiet, 0.014, opts).ended).toBeUndefined();
    let ended = false;
    for (let i = 0; i < 5; i++)
      ended = detector.push(quiet, 0.014, opts).ended === true;
    expect(ended).toBe(true);
    expect(extensions).toBe(3);
  });
  it("accepts a live end-silence window for semantic early-end", () => {
    const detector = new VoiceTurnDetector(24000);
    const speech = new Float32Array(1024).fill(0.1),
      quiet = new Float32Array(1024);
    for (let i = 0; i < 4; i++) detector.push(speech);
    const opts = { endSilenceMs: () => 100 };
    let result = detector.push(quiet, 0.014, opts);
    expect(result.ended).toBeUndefined();
    for (let i = 0; i < 2; i++)
      result = detector.push(quiet, 0.014, opts);
    expect(result.ended).toBe(true);
  });
  it("marks unusable turns ended without audio and stays silent in cooldown", () => {
    const detector = new VoiceTurnDetector(24000);
    const speech = new Float32Array(1024).fill(0.1),
      quiet = new Float32Array(1024);
    for (let i = 0; i < 4; i++) detector.push(speech);
    let result = detector.push(quiet);
    for (let i = 0; i < 19; i++) result = detector.push(quiet);
    expect(result.audio).toBeUndefined();
    expect(result.ended).toBe(true);
    result = detector.push(speech);
    expect(result.started).toBeUndefined();
    expect(result.live).toEqual([]);
  });
});
describe("turn continuation signals", () => {
  it.each([
    ["tell me more,", true],
    ["go on...", true],
    ["wait…", true],
    ["I want um", true],
    ["yes and", true],
    ["because", true],
    ["tea or", true],
    ["go to", true],
    ["with my", true],
    ["the", true],
    ["I think that", true],
    ["call me if", true],
    ["she is", true],
    ["more than", true],
    ["for example", true],
    ["5 plus", true],
    ["kind of", true],
    ["well-", true],
    ["say:", true],
    ["What time is it?", false],
    ["Yes.", false],
    ["Thanks a lot", false],
    ["", false],
    ["   ", false],
  ])("reads %j as continuation=%s", (text, expected) => {
    expect(isTurnContinuation(text)).toBe(expected);
  });
});
describe("turn completion signals", () => {
  it.each([
    ["I want to braid my hair.", true],
    ["What time is it?", true],
    ["Thanks a lot!", true],
    ["He said “go.”", true],
    ["Yes.", false],
    ["Wait…", false],
    ["Okay", false],
    ["tell me more,", false],
    ["yes and", false],
    ["Call me at five", false],
    ["", false],
  ])("reads %j as complete=%s", (text, expected) => {
    expect(isTurnComplete(text)).toBe(expected);
  });
});
describe("ML VAD fusion", () => {
  it("starts a turn on ML speech even when energy is silent", () => {
    const detector = new VoiceTurnDetector(24000);
    const quiet = new Float32Array(1024);
    let result;
    for (let i = 0; i < 4; i++)
      result = detector.push(quiet, 0.014, { mlSpeech: true });
    expect(result!.started).toBe(true);
  });
  it("never vetoes: loud energy still starts when ML says silence", () => {
    const detector = new VoiceTurnDetector(24000);
    const speech = new Float32Array(1024).fill(0.1);
    let result;
    for (let i = 0; i < 4; i++)
      result = detector.push(speech, 0.014, { mlSpeech: false });
    expect(result!.started).toBe(true);
  });
  it("treats missing ML as energy-only", () => {
    const detector = new VoiceTurnDetector(24000);
    const quiet = new Float32Array(1024);
    let result;
    for (let i = 0; i < 4; i++) result = detector.push(quiet);
    expect(result!.started).toBeUndefined();
  });
});
describe("pcm16 streaming bytes", () => {
  it("encodes mono 16-bit little-endian at the resampled rate", () => {
    const bytes = pcm16Bytes(new Float32Array([0, 0.5, -0.5, 1, -1]), 24000);
    expect(bytes).toHaveLength(10);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(Math.round(0.5 * 32767));
    expect(view.getInt16(4, true)).toBe(Math.round(-0.5 * 32768));
    expect(view.getInt16(6, true)).toBe(32767);
    expect(view.getInt16(8, true)).toBe(-32768);
  });
  it("resamples 48 kHz input down to 24 kHz", () => {
    expect(pcm16Bytes(new Float32Array(4800).fill(0.1), 48000)).toHaveLength(
      2400 * 2,
    );
  });
  it("matches the WAV payload bytes exactly", async () => {
    const samples = new Float32Array(2400).fill(0.1);
    const wav = new Uint8Array(
      await voiceWav(samples, 24000).arrayBuffer(),
    );
    expect(wav.slice(44)).toEqual(pcm16Bytes(samples, 24000));
  });
});
