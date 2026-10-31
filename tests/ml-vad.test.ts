import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MlVad,
  StreamResampler,
  isMlVadEnabled,
  type VadFeed,
  type VadSession,
} from "../src/ml-vad.ts";
afterEach(() => vi.unstubAllGlobals());
describe("ML VAD kill switch", () => {
  it("is on unless localStorage disables it", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    expect(isMlVadEnabled()).toBe(true);
    vi.stubGlobal("localStorage", { getItem: () => "0" });
    expect(isMlVadEnabled()).toBe(false);
  });
});
describe("StreamResampler", () => {
  it("converts 24 kHz to 16 kHz at an exact 3:2 ratio", () => {
    const resampler = new StreamResampler(24000, 16000);
    const out = resampler.push(new Float32Array(3000).fill(1));
    expect(out).toHaveLength(2000);
    expect(out.every((x) => x === 1)).toBe(true);
  });
  it("interpolates linearly between input samples", () => {
    const resampler = new StreamResampler(24000, 16000);
    const out = resampler.push(
      Float32Array.from({ length: 12 }, (_, i) => i),
    );
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(1.5, 5);
    expect(out[2]).toBe(3);
  });
  it("splits identically to one-shot pushes", () => {
    const split = new StreamResampler(24000, 16000);
    const first = split.push(
      Float32Array.from({ length: 1024 }, (_, i) => Math.sin(i / 100)),
    );
    const second = split.push(
      Float32Array.from({ length: 1024 }, (_, i) =>
        Math.sin((1024 + i) / 100),
      ),
    );
    const whole = new StreamResampler(24000, 16000).push(
      Float32Array.from({ length: 2048 }, (_, i) => Math.sin(i / 100)),
    );
    const joined = new Float32Array(first.length + second.length);
    joined.set(first, 0);
    joined.set(second, first.length);
    expect(joined).toEqual(whole);
  });
});
function fakeSession(probs: number[]) {
  const feeds: Record<string, VadFeed>[] = [];
  let calls = 0;
  const session: VadSession = {
    inputNames: ["input", "state", "sr"],
    run: async (offered) => {
      feeds.push(offered);
      const prob = probs[Math.min(calls++, probs.length - 1)];
      return {
        output: { data: [prob] },
        stateN: { data: new Float32Array(256).fill(calls) },
      };
    },
    release: async () => {},
  };
  return { session, feeds };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
describe("MlVad", () => {
  it("returns null before a session attaches (energy decides)", () => {
    const vad = new MlVad(null, 24000);
    expect(vad.push(new Float32Array(1024).fill(0.5))).toBeNull();
  });
  it("runs 576-sample windows with 64-sample context and thresholds the latest prob", async () => {
    const { session, feeds } = fakeSession([0.1, 0.9]);
    const vad = new MlVad(session, 24000);
    expect(vad.push(new Float32Array(1024).fill(0.5))).toBeNull();
    await flush();
    expect(vad.push(new Float32Array(1024).fill(0.5))).toBe(false);
    await flush();
    expect(vad.push(new Float32Array(1024).fill(0.5))).toBe(true);
    expect(feeds).toHaveLength(3);
    expect(feeds[0].input.dims).toEqual([1, 576]);
    expect(feeds[0].state.dims).toEqual([2, 1, 128]);
    expect(feeds[0].sr.dims).toEqual([1]);
    const first = feeds[0].input.data as Float32Array,
      second = feeds[1].input.data as Float32Array;
    expect(first.slice(0, 64).every((x) => x === 0)).toBe(true);
    expect(second.slice(0, 64)).toEqual(first.slice(512, 576));
  });
  it("fails closed to null when the session throws", async () => {
    let calls = 0;
    const session: VadSession = {
      inputNames: ["input"],
      run: async () => {
        calls++;
        throw Error("wasm missing");
      },
      release: async () => {},
    };
    const vad = new MlVad(session, 24000);
    vad.push(new Float32Array(1024).fill(0.5));
    await flush();
    expect(vad.push(new Float32Array(1024).fill(0.5))).toBeNull();
    await flush();
    expect(calls).toBe(1);
  });
  it("reports load-independent inference failures once", async () => {
    const reasons: string[] = [];
    let calls = 0;
    const session: VadSession = {
      inputNames: ["input"],
      run: async () => {
        calls++;
        throw Error("wasm trap");
      },
      release: async () => {},
    };
    const vad = new MlVad(session, 24000, 0.5, (reason) =>
      reasons.push(reason),
    );
    vad.push(new Float32Array(1024).fill(0.5));
    await flush();
    vad.push(new Float32Array(1024).fill(0.5));
    await flush();
    expect(calls).toBe(1);
    expect(reasons).toEqual(["wasm trap"]);
  });
  it("releases the session on dispose", async () => {
    let released = 0;
    const session: VadSession = {
      inputNames: [],
      run: async () => ({
        output: { data: [0] },
        stateN: { data: new Float32Array(256) },
      }),
      release: async () => {
        released++;
      },
    };
    const vad = new MlVad(session, 24000);
    await vad.dispose();
    expect(released).toBe(1);
    expect(vad.push(new Float32Array(1024).fill(0.5))).toBeNull();
  });
});
