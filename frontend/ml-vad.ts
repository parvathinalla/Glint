/**
 * Local neural voice activity detection (Silero v6, ONNX Runtime WASM).
 *
 * The ML signal is OR-fused with the energy detector: it can only ADD
 * speech verdicts (hearing quiet speech in noise that energy misses), never
 * veto them — pops and false starts stay cheap through the existing
 * confirm-gate and resume-on-drop machinery. Any load or inference failure
 * degrades silently to energy-only; nothing here can break voice.
 *
 * Framing follows Silero's OnnxWrapper convention, which v6 REQUIRES (plain
 * 512-sample windows collapse its state and score ~0 even on loud speech):
 * every run consumes 512 new 16 kHz samples prefixed with the 64-sample tail
 * of the previous block, advancing 512 samples per run.
 */
import type { Tensor } from "onnxruntime-web";
export const ML_VAD_THRESHOLD = 0.5;
const ML_SAMPLE_RATE = 16000;
const ML_WINDOW = 512;
const ML_CONTEXT = 64;
const ML_INPUT = ML_WINDOW + ML_CONTEXT;
const ML_STATE_DIMS = [2, 1, 128] as const;
export function isMlVadEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem("glint-ml-vad") !== "0";
  } catch {
    return true;
  }
}
/** Streaming linear resampler for arbitrary rates (the mic rate is a hint). */
export class StreamResampler {
  private buf = new Float32Array(0);
  private base = 0;
  private emitted = 0;
  private step: number;
  constructor(fromRate: number, toRate: number) {
    this.step = fromRate / toRate;
  }
  push(chunk: Float32Array): Float32Array {
    const input = new Float32Array(this.buf.length + chunk.length);
    input.set(this.buf, 0);
    input.set(chunk, this.buf.length);
    const out: number[] = [];
    for (;;) {
      const at = this.emitted * this.step - this.base,
        index = Math.floor(at);
      if (index + 1 >= input.length) break;
      const fraction = at - index;
      out.push(input[index] * (1 - fraction) + input[index + 1] * fraction);
      this.emitted++;
    }
    const next = this.emitted * this.step - this.base,
      drop = Math.min(Math.max(0, Math.floor(next)), input.length);
    this.buf = input.slice(drop);
    this.base += drop;
    return Float32Array.from(out);
  }
}
export type VadFeed = {
  type: "float32" | "int64";
  data: Float32Array | BigInt64Array;
  dims: number[];
};
export type VadSession = {
  readonly inputNames: readonly string[];
  run(feeds: Record<string, VadFeed>): Promise<{
    output: { data: ArrayLike<number> };
    stateN: { data: Float32Array };
  }>;
  release(): Promise<void>;
};
export class MlVad {
  private resampler: StreamResampler;
  private samples = new Float32Array(0);
  private context = new Float32Array(ML_CONTEXT);
  private state: Float32Array | null = null;
  private lastProb = 0;
  private hasResult = false;
  private pending = false;
  private failed = false;
  private disposed = false;
  constructor(
    private session: VadSession | null,
    sourceRate: number,
    private threshold = ML_VAD_THRESHOLD,
    private onFailure?: (reason: string) => void,
  ) {
    this.resampler = new StreamResampler(sourceRate, ML_SAMPLE_RATE);
  }
  private fail(reason: string) {
    if (this.failed) return;
    this.failed = true;
    this.onFailure?.(reason);
  }
  /** Attach a loaded session and start scoring (no-op after dispose). */
  attach(session: VadSession) {
    if (this.disposed) {
      void session.release().catch(() => {});
      return;
    }
    this.session = session;
    this.pump();
  }
  /**
   * Feed one mic frame. Returns the latest ML speech verdict, or null while
   * the model is loading, disabled, or failed (the caller falls back to
   * energy). Inference runs async-ahead: the verdict trails by ~one window.
   */
  push(frame: Float32Array): boolean | null {
    if (!this.session || this.failed || this.disposed) return null;
    const fresh = this.resampler.push(frame),
      joined = new Float32Array(this.samples.length + fresh.length);
    joined.set(this.samples, 0);
    joined.set(fresh, this.samples.length);
    this.samples = joined;
    this.pump();
    return this.hasResult ? this.lastProb >= this.threshold : null;
  }
  private pump() {
    const session = this.session;
    if (!session || this.failed || this.disposed || this.pending) return;
    if (this.samples.length < ML_WINDOW) return;
    const block = this.samples.slice(0, ML_WINDOW);
    this.samples = this.samples.slice(ML_WINDOW);
    const input = new Float32Array(ML_INPUT);
    input.set(this.context, 0);
    input.set(block, ML_CONTEXT);
    this.context = block.slice(-ML_CONTEXT);
    const feeds: Record<string, VadFeed> = {};
    if (session.inputNames.includes("input"))
      feeds.input = { type: "float32", data: input, dims: [1, ML_INPUT] };
    if (session.inputNames.includes("state"))
      feeds.state = {
        type: "float32",
        data: this.state ?? new Float32Array(256),
        dims: [...ML_STATE_DIMS],
      };
    if (session.inputNames.includes("sr"))
      feeds.sr = {
        type: "int64",
        data: BigInt64Array.from([BigInt(ML_SAMPLE_RATE)]),
        dims: [1],
      };
    this.pending = true;
    session.run(feeds).then(
      (result) => {
        this.pending = false;
        if (!result.output?.data || !result.stateN?.data) {
          this.fail("unexpected model outputs");
          return;
        }
        this.state = result.stateN.data;
        this.lastProb = result.output.data[0];
        this.hasResult = true;
        this.pump();
      },
      (error: unknown) => {
        this.pending = false;
        this.fail(error instanceof Error ? error.message : "inference failed");
      },
    );
  }
  async dispose() {
    this.disposed = true;
    this.failed = true;
    const session = this.session;
    this.session = null;
    if (session) await session.release().catch(() => {});
  }
}
/**
 * Load the real ONNX Runtime session. Imported lazily so the ~600 KB runtime
 * stays out of the main bundle; throws on any failure (the caller falls back
 * to energy-only voice).
 */
export async function loadVadSession(): Promise<VadSession> {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = "/vad/runtime/";
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create("/vad/silero_vad.onnx", {
    executionProviders: ["wasm"],
  });
  const inputNames = [...session.inputNames];
  return {
    inputNames,
    run: async (feeds) => {
      const ortFeeds: Record<string, Tensor> = {};
      for (const [name, feed] of Object.entries(feeds))
        ortFeeds[name] =
          feed.type === "int64"
            ? new ort.Tensor("int64", feed.data as BigInt64Array, feed.dims)
            : new ort.Tensor(
                "float32",
                feed.data as Float32Array,
                feed.dims,
              );
      const out = await session.run(ortFeeds);
      if (!out.output?.data || !out.stateN?.data)
        throw Error("Unexpected Silero outputs");
      return {
        output: { data: out.output.data as Float32Array },
        stateN: { data: out.stateN.data as Float32Array },
      };
    },
    release: () => session.release(),
  };
}
