/**
 * Local speaker lock (WeSpeaker ResNet34-LM, ONNX Runtime WASM).
 *
 * Each voice turn is embedded to a 256-dim voiceprint and compared against
 * the enrolled owner. Strangers fail CLOSED (their turns are dropped and any
 * interrupted reply resumes); everything uncertain fails OPEN (short turns,
 * load or inference failures, no enrollment) so the lock can never silence
 * the owner the way background noise once did.
 *
 * The frontend reproduces the Kaldi fbank the model trained on (25 ms Povey
 * window, 10 ms shift, 80 mel bins, per-utterance mean normalization):
 * validation showed CMN is REQUIRED (without it same-speaker and
 * cross-speaker scores overlap), while voiced-only frame selection does not
 * help, so full-turn audio is embedded.
 */
export const SPEAKER_MODEL_ID = "wespeaker-resnet34-LM";
export const SPEAKER_EMBED_DIM = 256;
/**
 * Reject threshold from real-model validation (resnet34-LM + CMN):
 * owner clean ~0.67, owner at 10 dB white noise 0.38, strangers <= 0.25.
 * Scores below reject; everything else is allowed (fail-open).
 */
export const SPEAKER_REJECT_THRESHOLD = 0.32;
/**
 * Turns with less voiced audio than this skip verification (backchannels
 * always pass). Voiced milliseconds, not WAV seconds: turn audio carries
 * pre-roll and end silence, so WAV duration always clears this floor.
 */
export const SPEAKER_MIN_SECONDS = 0.8;
const SPEAKER_SAMPLE_RATE = 16000;
const FBANK_BINS = 80;
const FRAME_LEN = 400;
const FRAME_SHIFT = 160;
const N_FFT = 512;
const PREEMPHASIS = 0.97;
const VOICEPRINT_KEY = "glint-speaker-voiceprint";
const VOICEPRINT_VERSION = 1;
export function isSpeakerLockEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem("glint-speaker-lock") !== "0";
  } catch {
    return true;
  }
}
/** In-place radix-2 FFT on parallel real/imaginary buffers. */
export function fftComplex(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len,
      wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cwr = 1,
        cwi = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j],
          ui = im[i + j],
          vr = re[i + j + len / 2] * cwr - im[i + j + len / 2] * cwi,
          vi = re[i + j + len / 2] * cwi + im[i + j + len / 2] * cwr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = nwr;
      }
    }
  }
}
let cachedBanks: Float32Array[] | null = null;
/** Kaldi-style triangular mel weights (1127*ln(1+f/700), 20 Hz–Nyquist). */
export function melFilterbanks(): Float32Array[] {
  if (cachedBanks) return cachedBanks;
  const toMel = (f: number) => 1127 * Math.log(1 + f / 700),
    toHz = (m: number) => 700 * (Math.exp(m / 1127) - 1),
    melLow = toMel(20),
    melHigh = toMel(SPEAKER_SAMPLE_RATE / 2),
    bins = Array.from(
      { length: FBANK_BINS + 2 },
      (_, i) =>
        Math.floor(
          ((N_FFT + 1) *
            toHz(melLow + ((melHigh - melLow) * i) / (FBANK_BINS + 1))) /
            SPEAKER_SAMPLE_RATE,
        ),
    );
  cachedBanks = Array.from({ length: FBANK_BINS }, (_, i) => {
    const row = new Float32Array(N_FFT / 2 + 1),
      left = bins[i],
      center = bins[i + 1],
      right = bins[i + 2];
    for (let j = left; j < center; j++) row[j] = (j - left) / (center - left);
    for (let j = center; j < right; j++) row[j] = (right - j) / (right - center);
    return row;
  });
  return cachedBanks;
}
/**
 * 80-dim log-mel features with per-utterance mean normalization, packed
 * row-major as [frames, bins]. Needs >= 400 samples (one 25 ms frame).
 */
export function fbankFeatures(wave: Float32Array): {
  data: Float32Array;
  frames: number;
} {
  const banks = melFilterbanks(),
    frames = 1 + Math.floor((wave.length - FRAME_LEN) / FRAME_SHIFT);
  if (frames < 1) throw Error("Speaker embedding needs at least 25 ms.");
  const window = new Float32Array(FRAME_LEN);
  for (let i = 0; i < FRAME_LEN; i++)
    window[i] = Math.pow(
      0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME_LEN - 1)),
      0.85,
    );
  const data = new Float32Array(frames * FBANK_BINS),
    re = new Float64Array(N_FFT),
    im = new Float64Array(N_FFT);
  let prevSample = 0;
  for (let f = 0; f < frames; f++) {
    const start = f * FRAME_SHIFT;
    let dc = 0;
    for (let i = 0; i < FRAME_LEN; i++) dc += wave[start + i];
    dc /= FRAME_LEN;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FRAME_LEN; i++) {
      const sample = wave[start + i] - dc;
      re[i] =
        (sample -
          PREEMPHASIS *
            (i === 0 ? prevSample - dc : wave[start + i - 1] - dc)) *
        window[i];
    }
    prevSample = wave[start + FRAME_LEN - 1];
    fftComplex(re, im);
    for (let b = 0; b < FBANK_BINS; b++) {
      let energy = 0;
      const weights = banks[b];
      for (let k = 0; k <= N_FFT / 2; k++)
        energy += (re[k] * re[k] + im[k] * im[k]) * weights[k];
      data[f * FBANK_BINS + b] = Math.log(Math.max(energy, 1e-10));
    }
  }
  for (let b = 0; b < FBANK_BINS; b++) {
    let mean = 0;
    for (let f = 0; f < frames; f++) mean += data[f * FBANK_BINS + b];
    mean /= frames;
    for (let f = 0; f < frames; f++) data[f * FBANK_BINS + b] -= mean;
  }
  return { data, frames };
}
/** Batch linear resampler for fixed buffers (enrollment clips, turns). */
export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input.slice();
  const out = new Float32Array(
    Math.max(1, Math.floor((input.length * toRate) / fromRate)),
  );
  for (let i = 0; i < out.length; i++) {
    const pos = (i * fromRate) / toRate,
      i0 = Math.min(Math.floor(pos), input.length - 1),
      frac = pos - i0;
    out[i] =
      input[i0] * (1 - frac) + input[Math.min(i0 + 1, input.length - 1)] * frac;
  }
  return out;
}
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
/** Mean of enrollment embeddings, L2-normalized (averaging rescues noise). */
export function averageVoiceprint(samples: Float32Array[]): Float32Array {
  const mean = new Float32Array(SPEAKER_EMBED_DIM);
  for (const sample of samples)
    for (let i = 0; i < mean.length; i++) mean[i] += sample[i] / samples.length;
  let norm = 0;
  for (const v of mean) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < mean.length; i++) mean[i] /= norm;
  return mean;
}
export type SpeakerVerdict = "owner" | "stranger";
export function verifyScore(score: number): SpeakerVerdict {
  return score < SPEAKER_REJECT_THRESHOLD ? "stranger" : "owner";
}
export type Voiceprint = {
  version: number;
  model: string;
  dim: number;
  samples: number;
  enrolledAt: number;
  vector: number[];
};
export function loadVoiceprint(): Voiceprint | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(VOICEPRINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Voiceprint>;
    if (
      parsed.version !== VOICEPRINT_VERSION ||
      parsed.model !== SPEAKER_MODEL_ID ||
      parsed.dim !== SPEAKER_EMBED_DIM ||
      !Array.isArray(parsed.vector) ||
      parsed.vector.length !== SPEAKER_EMBED_DIM ||
      !parsed.vector.every((v) => typeof v === "number" && Number.isFinite(v))
    )
      return null;
    return parsed as Voiceprint;
  } catch {
    return null;
  }
}
export function saveVoiceprint(vector: Float32Array, samples: number): Voiceprint {
  const voiceprint: Voiceprint = {
    version: VOICEPRINT_VERSION,
    model: SPEAKER_MODEL_ID,
    dim: SPEAKER_EMBED_DIM,
    samples,
    enrolledAt: Date.now(),
    vector: Array.from(vector),
  };
  localStorage.setItem(VOICEPRINT_KEY, JSON.stringify(voiceprint));
  return voiceprint;
}
export function clearVoiceprint(): void {
  try {
    localStorage.removeItem(VOICEPRINT_KEY);
  } catch {
    /* storage unavailable: nothing persisted anyway */
  }
}
/** Decode PCM16 WAV bytes (any rate, mono or stereo) to 16 kHz mono float. */
export function wavBytesToMono16k(bytes: Uint8Array): {
  samples: Float32Array;
  seconds: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12,
    rate = 0,
    channels = 0,
    dataAt = -1,
    dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3),
      ),
      length = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      const format = view.getUint16(offset + 8, true);
      if (format !== 1) throw Error("Only PCM WAV is supported.");
      channels = view.getUint16(offset + 10, true);
      rate = view.getUint32(offset + 12, true);
      if (view.getUint16(offset + 22, true) !== 16)
        throw Error("Only 16-bit WAV is supported.");
    }
    if (id === "data") {
      dataAt = offset + 8;
      dataLength = length;
      break;
    }
    offset += 8 + length + (length % 2);
  }
  if (!rate || !channels || dataAt < 0) throw Error("Unrecognized WAV bytes.");
  const count = Math.floor(dataLength / 2 / channels),
    mono = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++)
      sum += view.getInt16(dataAt + (i * channels + c) * 2, true);
    mono[i] = sum / channels / 32768;
  }
  return {
    samples: resampleLinear(mono, rate, SPEAKER_SAMPLE_RATE),
    seconds: count / rate,
  };
}
export type EmbedSession = {
  readonly inputName: string;
  readonly outputName: string;
  run(feats: Float32Array, frames: number): Promise<Float32Array>;
  release(): Promise<void>;
};
/**
 * Load the real ONNX Runtime session. Imported lazily so the runtime and the
 * 25 MB model stay out of the main bundle; throws on any failure (the caller
 * fails open to answering everyone).
 */
export async function loadSpeakerSession(): Promise<EmbedSession> {
  const ort = await import("onnxruntime-web");
  // Shared with the VAD runtime: one WASM build serves both models.
  ort.env.wasm.wasmPaths = "/vad/runtime/";
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(
    "/speaker/wespeaker_resnet34_LM.onnx",
    { executionProviders: ["wasm"] },
  );
  const inputName = session.inputNames[0],
    outputName = session.outputNames[0];
  return {
    inputName,
    outputName,
    run: async (feats, frames) => {
      const out = await session.run({
        [inputName]: new ort.Tensor("float32", feats, [1, frames, FBANK_BINS]),
      });
      const embedding = out[outputName]?.data as
        | Float32Array
        | undefined;
      if (!embedding || embedding.length !== SPEAKER_EMBED_DIM)
        throw Error("Unexpected speaker model outputs");
      return embedding;
    },
    release: () => session.release(),
  };
}
type EmbedOverride = (
  samples: Float32Array,
) => Float32Array | Promise<Float32Array>;
function testEmbedOverride(): EmbedOverride | null {
  const hook = (
    globalThis as { __glintSpeaker?: { embed?: EmbedOverride } }
  ).__glintSpeaker?.embed;
  return typeof hook === "function" ? hook : null;
}
/**
 * One embedder per voice session. Loads the model lazily on first use,
 * serializes runs (low-end phones), and reports failures once so the UI can
 * say the lock is off instead of silently answering strangers.
 */
export class SpeakerEmbedder {
  private session: EmbedSession | null = null;
  private loading: Promise<EmbedSession> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private failed = false;
  constructor(private onFailure?: (reason: string) => void) {}
  private fail(reason: string) {
    if (this.failed) return;
    this.failed = true;
    this.onFailure?.(reason);
  }
  private ensure(): Promise<EmbedSession> {
    if (this.session) return Promise.resolve(this.session);
    if (!this.loading) {
      this.loading = loadSpeakerSession().then(
        (session) => {
          this.session = session;
          return session;
        },
        (error: unknown) => {
          this.loading = null;
          throw error;
        },
      );
    }
    return this.loading;
  }
  /** Embed 16 kHz mono audio, or null when the lock is unavailable. */
  embed(wave: Float32Array): Promise<Float32Array | null> {
    if (this.failed) return Promise.resolve(null);
    const override = testEmbedOverride();
    if (override) return Promise.resolve(override(wave));
    const run = this.queue.then(async () => {
      try {
        const session = await this.ensure(),
          { data, frames } = fbankFeatures(wave);
        return await session.run(data, frames);
      } catch (error) {
        this.fail(error instanceof Error ? error.message : "inference failed");
        return null;
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async dispose() {
    const session = this.session;
    this.session = null;
    this.loading = null;
    if (session) await session.release().catch(() => {});
  }
}
/**
 * Correlates async speaker checks with the sends they gate. WAV sends claim
 * by blob identity (exact); streamed-transcript sends carry no audio and
 * claim oldest-first (finals arrive in turn order). Dropped sends purge the
 * queue so a swallowed turn's check can never judge a later turn.
 */
export type SpeakerCheck = {
  audio: Blob;
  promise: Promise<SpeakerVerdict | null>;
  settled?: SpeakerVerdict | "unknown";
};
export class SpeakerCheckQueue {
  private checks: SpeakerCheck[] = [];
  push(audio: Blob, promise: Promise<SpeakerVerdict | null>): void {
    const check: SpeakerCheck = { audio, promise };
    promise.then(
      (verdict) => {
        check.settled = verdict ?? "unknown";
      },
      () => {
        check.settled = "unknown";
      },
    );
    this.checks.push(check);
    while (this.checks.length > 3) this.checks.shift();
  }
  claim(audio?: Blob): SpeakerCheck | null {
    if (!this.checks.length) return null;
    if (audio) {
      // A WAV send always finds its own entry (pushed synchronously at
      // turn end); a miss means it was purged, so fail open without
      // disturbing another turn's check.
      const at = this.checks.findIndex((check) => check.audio === audio);
      return at >= 0 ? this.checks.splice(at, 1)[0] : null;
    }
    return this.checks.shift() ?? null;
  }
  purge(): void {
    this.checks = [];
  }
  get size(): number {
    return this.checks.length;
  }
}
/**
 * Burstiness voice-activity check for enrollment clips: speech has loud
 * bursts over quiet gaps (AGC'd room tone is steady, silence is flat).
 * Enrolling silence would mint a garbage voiceprint, so inaudible samples
 * are retried instead of saved.
 */
export function sampleHasSpeech(
  samples: Float32Array,
  sampleRate: number,
): boolean {
  const frame = Math.max(1, Math.floor(sampleRate * 0.02)),
    rms: number[] = [];
  for (let start = 0; start + frame <= samples.length; start += frame) {
    let energy = 0;
    for (let i = 0; i < frame; i++) energy += samples[start + i] ** 2;
    rms.push(Math.sqrt(energy / frame));
  }
  if (!rms.length) return false;
  const peak = Math.max(...rms);
  if (peak <= 0.02) return false;
  // A lone click also peaks; speech sustains across frames.
  const voiced = rms.filter((v) => v > 0.02).length / rms.length;
  if (voiced < 0.1) return false;
  if (peak > 0.15) return true;
  const sorted = [...rms].sort((a, b) => a - b),
    median = Math.max(sorted[Math.floor(sorted.length / 2)], 1e-4);
  return peak / median > 4;
}
/**
 * Record a fixed-length enrollment sample from a fresh mic stream and decode
 * it to mono float. Opens its own stream so enrollment works whether or not
 * voice chat is running.
 */
export async function captureEnrollmentSample(
  seconds: number,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  try {
    const recorder = new MediaRecorder(media),
      chunks: Blob[] = [];
    const done = new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => resolve(new Blob(chunks));
    });
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    recorder.stop();
    const bytes = await (await done).arrayBuffer(),
      context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(bytes),
        first = decoded.getChannelData(0);
      if (decoded.numberOfChannels < 2)
        return { samples: first.slice(), sampleRate: decoded.sampleRate };
      const mono = new Float32Array(first.length);
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const channel = decoded.getChannelData(c);
        for (let i = 0; i < mono.length; i++) mono[i] += channel[i];
      }
      for (let i = 0; i < mono.length; i++) mono[i] /= decoded.numberOfChannels;
      return { samples: mono, sampleRate: decoded.sampleRate };
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    media.getTracks().forEach((track) => track.stop());
  }
}
