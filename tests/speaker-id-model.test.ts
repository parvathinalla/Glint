import { describe, expect, it } from "vitest";
import ort from "onnxruntime-web";
import { readFileSync } from "node:fs";
import {
  SPEAKER_EMBED_DIM,
  SPEAKER_REJECT_THRESHOLD,
  cosineSimilarity,
  fbankFeatures,
} from "../src/speaker-id.ts";
/**
 * Real-model characterization: pins WeSpeaker ResNet34-LM's response
 * classes (same speaker high, noise/non-voice low) with wide margins around
 * the 0.32 reject threshold. Guards the vendored weights, the Kaldi/CMN
 * frontend, and the threshold against regressions. Slow (~10 s); failure
 * means the model file or runtime changed behavior.
 */
function readMono16k(path: string): Float32Array {
  const bytes = readFileSync(path),
    view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12,
    dataAt = -1,
    dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const length = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      expect(view.getUint16(offset + 8, true)).toBe(1);
      expect(view.getUint16(offset + 10, true)).toBe(1);
      expect(view.getUint32(offset + 12, true)).toBe(16000);
    }
    if (id === "data") {
      dataAt = offset + 8;
      dataLength = length;
      break;
    }
    offset += 8 + length + (length % 2);
  }
  expect(dataAt).toBeGreaterThan(0);
  const samples = new Float32Array(dataLength / 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = view.getInt16(dataAt + i * 2, true) / 32768;
  return samples;
}
function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
describe("real speaker model behavior", () => {
  it(
    "separates same-speaker from non-voice around the threshold",
    async () => {
      ort.env.wasm.wasmPaths = "./node_modules/onnxruntime-web/dist/";
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(
        "public/speaker/wespeaker_resnet34_LM.onnx",
        { executionProviders: ["wasm"] },
      );
      expect(session.inputNames).toEqual(["feats"]);
      expect(session.outputNames).toEqual(["embs"]);
      const embed = async (wave: Float32Array): Promise<Float32Array> => {
        const { data, frames } = fbankFeatures(wave);
        const out = await session.run({
          feats: new ort.Tensor("float32", data, [1, frames, 80]),
        });
        const embedding = out.embs.data as Float32Array;
        expect(embedding).toHaveLength(SPEAKER_EMBED_DIM);
        return embedding;
      };
      // Same speaker (two JFK segments, different sentences): must clear the
      // threshold with margin. Measured 0.72; real-speaker validation across
      // three voices held >= 0.67 clean.
      const jfk = readMono16k("tests/fixtures/speech-jfk.wav"),
        embA = await embed(jfk.slice(0, 5 * 16000)),
        embB = await embed(jfk.slice(5.5 * 16000, 10.5 * 16000)),
        same = cosineSimilarity(embA, embB);
      expect(same).toBeGreaterThan(SPEAKER_REJECT_THRESHOLD + 0.2);
      // Non-voice must fall below the threshold with margin (measured 0.20
      // noise, -0.02 sine), so bursts and silence never pass as the owner.
      const rand = mulberry(11),
        noise = new Float32Array(5 * 16000);
      for (let i = 0; i < noise.length; i++)
        noise[i] = (rand() * 2 - 1) * 0.3;
      expect(cosineSimilarity(embA, await embed(noise))).toBeLessThan(
        SPEAKER_REJECT_THRESHOLD - 0.1,
      );
      const sine = new Float32Array(5 * 16000);
      for (let i = 0; i < sine.length; i++)
        sine[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / 16000);
      expect(cosineSimilarity(embA, await embed(sine))).toBeLessThan(
        SPEAKER_REJECT_THRESHOLD - 0.1,
      );
      // Short owner clips still verify (measured 0.59 at 1 s, 0.45 at
      // 0.5 s): the duration bypass is belt-and-braces, not load-bearing.
      expect(
        cosineSimilarity(embA, await embed(jfk.slice(5.5 * 16000, 6.5 * 16000))),
      ).toBeGreaterThan(SPEAKER_REJECT_THRESHOLD);
      // Deterministic: the same clip embeds bit-identically.
      const repeat = await embed(jfk.slice(0, 5 * 16000));
      expect(repeat).toEqual(embA);
      await session.release();
    },
    120000,
  );
});
