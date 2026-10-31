import { describe, expect, it, vi, afterEach } from "vitest";
import {
  SPEAKER_EMBED_DIM,
  SPEAKER_MODEL_ID,
  SPEAKER_REJECT_THRESHOLD,
  SpeakerCheckQueue,
  SpeakerEmbedder,
  averageVoiceprint,
  clearVoiceprint,
  cosineSimilarity,
  fbankFeatures,
  fftComplex,
  isSpeakerLockEnabled,
  loadVoiceprint,
  melFilterbanks,
  resampleLinear,
  sampleHasSpeech,
  saveVoiceprint,
  verifyScore,
  wavBytesToMono16k,
} from "../src/speaker-id.ts";
function stubStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  });
  return store;
}
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("speaker frontend", () => {
  it("computes an impulse FFT as a flat spectrum", () => {
    const re = new Float64Array(8),
      im = new Float64Array(8);
    re[0] = 1;
    fftComplex(re, im);
    for (let i = 0; i < 8; i++) {
      expect(re[i]).toBeCloseTo(1, 9);
      expect(im[i]).toBeCloseTo(0, 9);
    }
  });
  it("peaks a 220 Hz sine at the expected 512-point bin", () => {
    const re = new Float64Array(512),
      im = new Float64Array(512);
    for (let i = 0; i < 512; i++)
      re[i] = Math.sin((2 * Math.PI * 220 * i) / 16000);
    fftComplex(re, im);
    let peak = 0,
      at = -1;
    for (let k = 1; k < 256; k++) {
      const power = re[k] * re[k] + im[k] * im[k];
      if (power > peak) {
        peak = power;
        at = k;
      }
    }
    expect(at).toBe(Math.round((220 * 512) / 16000));
  });
  it("builds 80 triangular mel banks covering the spectrum", () => {
    const banks = melFilterbanks();
    expect(banks).toHaveLength(80);
    const covered = new Array(257).fill(false);
    for (const row of banks) {
      expect(row).toHaveLength(257);
      for (let k = 0; k < 257; k++) if (row[k] > 0) covered[k] = true;
    }
    // Truncated bin edges can leave a redundant all-zero row (Kaldi
    // behaves the same), and the DC/Nyquist edge bins carry zero weight by
    // triangular construction (DC is removed pre-FFT anyway). What matters
    // is no blind spot across the interior spectrum.
    for (let k = 1; k < 256; k++) expect(covered[k]).toBe(true);
    expect(melFilterbanks()).toBe(banks);
  });
  it("frames one second of audio as 98 mean-normalized rows", () => {
    const wave = new Float32Array(16000);
    for (let i = 0; i < wave.length; i++)
      wave[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / 16000);
    const { data, frames } = fbankFeatures(wave);
    expect(frames).toBe(98);
    expect(data).toHaveLength(98 * 80);
    for (const v of data) expect(Number.isFinite(v)).toBe(true);
    for (let b = 0; b < 80; b++) {
      let mean = 0;
      for (let f = 0; f < frames; f++) mean += data[f * 80 + b];
      expect(mean / frames).toBeCloseTo(0, 6);
    }
    const again = fbankFeatures(wave);
    expect(again.data).toEqual(data);
  });
  it("rejects audio shorter than one frame", () => {
    expect(() => fbankFeatures(new Float32Array(399))).toThrow();
  });
});
describe("resampling and scoring", () => {
  it("copies identical rates and scales buffer length otherwise", () => {
    const input = Float32Array.from([0, 0.5, 1]);
    expect(resampleLinear(input, 16000, 16000)).toEqual(input);
    expect(resampleLinear(new Float32Array(2400), 24000, 16000)).toHaveLength(
      1600,
    );
  });
  it("holds a constant signal steady across rates", () => {
    const out = resampleLinear(new Float32Array(2400).fill(0.25), 24000, 16000);
    for (const v of out) expect(v).toBeCloseTo(0.25, 6);
  });
  it("scores cosine similarity with a zero-safe floor", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 9);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 9);
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 9);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
  it("averages enrollment samples into a unit voiceprint", () => {
    const a = new Float32Array(SPEAKER_EMBED_DIM).fill(1),
      b = new Float32Array(SPEAKER_EMBED_DIM).fill(3),
      mean = averageVoiceprint([a, b]);
    let norm = 0;
    for (const v of mean) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 6);
    expect(mean[0]).toBeCloseTo(mean[1], 9);
  });
  it("rejects below the threshold and allows at or above it", () => {
    expect(verifyScore(SPEAKER_REJECT_THRESHOLD - 0.001)).toBe("stranger");
    expect(verifyScore(SPEAKER_REJECT_THRESHOLD)).toBe("owner");
    expect(verifyScore(0.9)).toBe("owner");
  });
});
describe("voiceprint storage", () => {
  it("round-trips a saved voiceprint", () => {
    stubStorage();
    const vector = new Float32Array(SPEAKER_EMBED_DIM).fill(0.5);
    saveVoiceprint(vector, 2);
    const loaded = loadVoiceprint();
    expect(loaded?.model).toBe(SPEAKER_MODEL_ID);
    expect(loaded?.dim).toBe(SPEAKER_EMBED_DIM);
    expect(loaded?.samples).toBe(2);
    expect(loaded?.vector).toHaveLength(SPEAKER_EMBED_DIM);
    expect(loaded?.vector[0]).toBeCloseTo(0.5, 6);
  });
  it("rejects corrupt, mismatched, and missing voiceprints", () => {
    stubStorage({ "glint-speaker-voiceprint": "not json" });
    expect(loadVoiceprint()).toBeNull();
    const vector = new Float32Array(SPEAKER_EMBED_DIM).fill(0.1);
    saveVoiceprint(vector, 1);
    const store = JSON.parse(
      localStorage.getItem("glint-speaker-voiceprint") ?? "{}",
    ) as Record<string, unknown>;
    localStorage.setItem(
      "glint-speaker-voiceprint",
      JSON.stringify({ ...store, vector: [1, 2, 3] }),
    );
    expect(loadVoiceprint()).toBeNull();
    localStorage.setItem(
      "glint-speaker-voiceprint",
      JSON.stringify({ ...store, model: "other-model" }),
    );
    expect(loadVoiceprint()).toBeNull();
    clearVoiceprint();
    expect(loadVoiceprint()).toBeNull();
  });
  it("honors the speaker-lock kill switch", () => {
    stubStorage();
    expect(isSpeakerLockEnabled()).toBe(true);
    stubStorage({ "glint-speaker-lock": "0" });
    expect(isSpeakerLockEnabled()).toBe(false);
  });
});
function encodeWav(
  channelsData: Float32Array[],
  sampleRate: number,
): Uint8Array {
  const channels = channelsData.length,
    frames = channelsData[0].length,
    data = new Uint8Array(frames * channels * 2 + 44),
    view = new DataView(data.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(at + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, data.length - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, frames * channels * 2, true);
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++)
      view.setInt16(
        44 + (i * channels + c) * 2,
        Math.max(-1, Math.min(1, channelsData[c][i])) * 32767,
        true,
      );
  return data;
}
describe("turn WAV decoding", () => {
  it("decodes 24 kHz mono turns to 16 kHz with true duration", () => {
    const samples = new Float32Array(24000).fill(0.5),
      { samples: mono, seconds } = wavBytesToMono16k(
        encodeWav([samples], 24000),
      );
    expect(seconds).toBeCloseTo(1, 6);
    expect(mono).toHaveLength(16000);
    expect(mono[8000]).toBeCloseTo(0.5, 2);
  });
  it("averages stereo channels and rejects non-PCM bytes", () => {
    const left = new Float32Array(160).fill(0.4),
      right = new Float32Array(160),
      stereo = wavBytesToMono16k(encodeWav([left, right], 16000));
    expect(stereo.samples[10]).toBeCloseTo(0.2, 2);
    expect(stereo.seconds).toBeCloseTo(0.01, 6);
    const pcm = encodeWav([new Float32Array(160).fill(0.1)], 16000);
    new DataView(pcm.buffer).setUint16(20, 3, true);
    expect(() => wavBytesToMono16k(pcm)).toThrow();
    expect(() => wavBytesToMono16k(new Uint8Array(64))).toThrow();
  });
});
describe("check queue", () => {
  const verdict = (v: "owner" | "stranger" | null) => Promise.resolve(v);
  it("claims WAV sends by blob and streamed sends oldest-first", async () => {
    const queue = new SpeakerCheckQueue(),
      a = new Blob(["a"]),
      b = new Blob(["b"]);
    queue.push(a, verdict("owner"));
    queue.push(b, verdict("stranger"));
    expect(queue.size).toBe(2);
    expect(queue.claim(b)?.promise).toBeDefined();
    expect(queue.size).toBe(1);
    const streamed = queue.claim();
    expect(streamed?.audio).toBe(a);
    await expect(streamed?.promise).resolves.toBe("owner");
    expect(queue.claim()).toBeNull();
  });
  it("fails open on a missed blob and tracks settlement", async () => {
    const queue = new SpeakerCheckQueue(),
      a = new Blob(["a"]);
    queue.push(a, verdict("stranger"));
    expect(queue.claim(new Blob(["other"]))).toBeNull();
    expect(queue.size).toBe(1);
    const check = queue.claim(a);
    await check?.promise;
    expect(check?.settled).toBe("stranger");
    queue.push(a, Promise.reject(Error("boom")));
    const failed = queue.claim(a);
    await failed?.promise.catch(() => {});
    expect(failed?.settled).toBe("unknown");
  });
  it("purges swallowed turns and caps runaway growth", () => {
    const queue = new SpeakerCheckQueue();
    for (let i = 0; i < 5; i++) queue.push(new Blob([`${i}`]), verdict("owner"));
    expect(queue.size).toBe(3);
    queue.purge();
    expect(queue.size).toBe(0);
    expect(queue.claim()).toBeNull();
  });
});
describe("enrollment speech check", () => {
  it("accepts bursty speech and loud sustained sound", () => {
    const bursty = new Float32Array(4 * 16000);
    for (let i = 16000; i < 32000; i++) bursty[i] = 0.1;
    expect(sampleHasSpeech(bursty, 16000)).toBe(true);
    expect(sampleHasSpeech(new Float32Array(16000).fill(0.2), 16000)).toBe(
      true,
    );
  });
  it("rejects silence and steady room tone", () => {
    expect(sampleHasSpeech(new Float32Array(4 * 16000), 16000)).toBe(false);
    expect(sampleHasSpeech(new Float32Array(4 * 16000).fill(0.03), 16000)).toBe(
      false,
    );
    expect(sampleHasSpeech(new Float32Array(100), 16000)).toBe(false);
  });
  it("rejects a lone click in silence", () => {
    const click = new Float32Array(4 * 16000);
    for (let i = 0; i < 200; i++) click[16000 + i] = 0.1;
    expect(sampleHasSpeech(click, 16000)).toBe(false);
  });
});
describe("embedder test hook", () => {
  it("uses the injected scorer instead of the neural model", async () => {
    const vector = new Float32Array(SPEAKER_EMBED_DIM).fill(0.25);
    vi.stubGlobal("__glintSpeaker", { embed: () => vector });
    const embedder = new SpeakerEmbedder();
    await expect(embedder.embed(new Float32Array(16000))).resolves.toBe(
      vector,
    );
    await embedder.dispose();
  });
  it("reports load failure once and fails open to null", async () => {
    const reasons: string[] = [],
      embedder = new SpeakerEmbedder((reason) => reasons.push(reason));
    await expect(embedder.embed(new Float32Array(16000))).resolves.toBeNull();
    await expect(embedder.embed(new Float32Array(16000))).resolves.toBeNull();
    expect(reasons).toHaveLength(1);
    await embedder.dispose();
  });
});
