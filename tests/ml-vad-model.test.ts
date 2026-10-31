import { describe, expect, it } from "vitest";
import ort from "onnxruntime-web";
import { readFileSync } from "node:fs";
/**
 * Real-model characterization: pins Silero's response classes (speech high,
 * silence/noise low) with wide margins. Guards the vendored weights,
 * threshold, and 64-context framing against regressions. Slow (~10 s);
 * failure means the model file or runtime changed behavior.
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
describe("real Silero model behavior", () => {
  it(
    "scores speech high, silence and noise low",
    async () => {
      ort.env.wasm.wasmPaths = "./node_modules/onnxruntime-web/dist/";
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(
        "public/vad/silero_vad.onnx",
        { executionProviders: ["wasm"] },
      );
      const score = async (audio: Float32Array): Promise<number> => {
        let state = new ort.Tensor(
          "float32",
          new Float32Array(256),
          [2, 1, 128],
        );
        const sr = new ort.Tensor(
          "int64",
          BigInt64Array.from([BigInt(16000)]),
          [1],
        );
        let context = new Float32Array(64),
          max = 0;
        for (let o = 0; o + 512 <= audio.length; o += 512) {
          const withContext = new Float32Array(576);
          withContext.set(context, 0);
          withContext.set(audio.slice(o, o + 512), 64);
          context = audio.slice(o + 512 - 64, o + 512);
          const result = await session.run({
            input: new ort.Tensor("float32", withContext, [1, 576]),
            state,
            sr,
          });
          max = Math.max(max, (result.output.data as Float32Array)[0]);
          state = result.stateN as typeof state;
        }
        return max;
      };
      const speech = readMono16k("tests/fixtures/speech-jfk.wav");
      expect(await score(speech)).toBeGreaterThan(0.8);
      expect(await score(new Float32Array(16000))).toBeLessThan(0.1);
      let seed = 1234;
      const noise = new Float32Array(16000);
      for (let i = 0; i < noise.length; i++) {
        seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
        noise[i] = (seed / 0x7fffffff) * 2 - 1;
      }
      for (let i = 0; i < noise.length; i++) noise[i] *= 0.0866 / 0.5774;
      expect(await score(noise)).toBeLessThan(0.3);
      await session.release();
    },
    120000,
  );
});
