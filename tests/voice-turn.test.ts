import { describe, expect, it } from "vitest";
import {
  VoiceTurnDetector,
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
