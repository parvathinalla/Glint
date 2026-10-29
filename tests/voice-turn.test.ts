import { describe, expect, it } from "vitest";
import { VoiceTurnDetector, voiceWav } from "../shared/voice-turn.ts";
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
