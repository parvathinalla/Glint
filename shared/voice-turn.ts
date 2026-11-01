/** Bounded local endpoint detection: silence never dispatches a model request. */
export const NOISE_FLOOR_MARGIN = 4;
export const NOISE_FLOOR_WINDOW_MS = 5000;
export const NOISE_FLOOR_LAG_MS = 300;
export const DEFAULT_END_SILENCE_MS = 1100;
/** Patient end window even when ASR inserts terminal punctuation. */
export const COMPLETE_END_SILENCE_MS = 1200;
const COMPLETE_MIN_LENGTH = 12;
/**
 * True when a trailing partial reads mid-thought, so endpointing should wait
 * through one more silence window instead of cutting hesitant speech.
 * Biased toward recall: a false extension costs one window, a false end cuts
 * the user off.
 */
export function isTurnContinuation(text: string): boolean {
  const trailing = text.trimEnd();
  if (!trailing) return false;
  if (/([,;:…]|\.\.\.|[-–—])\s*$/.test(trailing)) return true;
  return /\b(and|but|or|nor|yet|for|so|because|if|whether|while|although|though|unless|until|since|whereas|that|which|who|whom|whose|when|where|to|of|in|on|at|with|from|by|about|as|into|onto|through|during|after|before|between|against|among|without|within|upon|toward|towards|beside|beyond|around|a|an|the|some|any|my|your|his|her|our|their|this|these|those|each|every|another|such|is|are|was|were|be|been|being|am|do|does|did|have|has|had|will|would|can|could|should|shall|may|might|must|than|like|you know|for example|such as|kind of|sort of|plus|minus|times|versus|vs|um+|uh+|erm+|hmm+)\s*$/i.test(
    trailing.replace(/[.!?]+$/,""),
  );
}
/**
 * True when a trailing partial reads finished: long enough plus terminal
 * punctuation. Deliberately conservative — short acknowledgments stay on the
 * patient path, because a stale partial can split "Yes, and…" in two.
 */
export function isTurnComplete(text: string): boolean {
  const trailing = text.trimEnd();
  if (trailing.length < COMPLETE_MIN_LENGTH) return false;
  return /[.!?…]["”')\]]*$/.test(trailing);
}
export class VoiceTurnDetector {
  private pre: Float32Array[] = [];
  private chunks: Float32Array[] = [];
  private time = 0;
  private began = 0;
  private lastVoice = 0;
  private candidate = 0;
  private voiced = 0;
  private cooldown = false;
  private quiet = 0;
  private floor = 0;
  private levels: { at: number; rms: number }[] = [];
  active = false;
  constructor(private rate: number) {}
  reset() {
    this.pre = [];
    this.chunks = [];
    this.active = false;
    this.candidate = 0;
    this.voiced = 0;
  }
  push(
    frame: Float32Array,
    threshold = 0.014,
    opts: {
      endSilenceMs?: number | (() => number);
      shouldExtend?: () => boolean;
      onSpeechProgress?: (voicedMs: number) => void;
      /**
       * Neural speech verdict for this frame. OR-fused: ML can only add
       * speech detections (quiet speech in noise), never veto energy.
       */
      mlSpeech?: boolean | null;
    } = {},
  ): {
    started?: boolean;
    audio?: Float32Array;
    live: Float32Array[];
    ended?: boolean;
    /** Voiced milliseconds in the ended turn (silence excluded). */
    voicedMs?: number;
  } {
    const ms = (frame.length / this.rate) * 1000;
    this.time += ms;
    const level = Math.sqrt(
      frame.reduce((sum, sample) => sum + sample * sample, 0) / frame.length,
    );
    const effective = Math.max(threshold, this.floor * NOISE_FLOOR_MARGIN);
    const speech = level >= effective || opts.mlSpeech === true;
    if (!this.active) {
      this.levels.push({ at: this.time, rms: level });
      while (
        this.levels.length &&
        this.levels[0].at < this.time - NOISE_FLOOR_WINDOW_MS
      )
        this.levels.shift();
      const settled = this.levels.filter(
        (entry) => entry.at < this.time - NOISE_FLOOR_LAG_MS,
      );
      this.floor = settled.length
        ? Math.min(...settled.map((entry) => entry.rms))
        : 0;
    }
    if (this.cooldown) {
      this.quiet = speech ? 0 : this.quiet + ms;
      if (this.quiet >= 400) {
        this.cooldown = false;
        this.quiet = 0;
      }
      return { live: [] };
    }
    let started = false;
    let live: Float32Array[] = [];
    if (!this.active) {
      this.pre.push(frame.slice());
      while (
        this.pre.reduce((sum, chunk) => sum + chunk.length, 0) >
        this.rate * 0.3
      )
        this.pre.shift();
      this.candidate = speech ? this.candidate + ms : 0;
      if (this.candidate < 160) return { live: [] };
      this.active = true;
      started = true;
      this.began = this.time - this.candidate;
      this.lastVoice = this.time;
      this.voiced = this.candidate;
      this.chunks = this.pre;
      this.pre = [];
      live = [...this.chunks];
    } else {
      const copy = frame.slice();
      this.chunks.push(copy);
      live = [copy];
      if (speech) {
        this.lastVoice = this.time;
        this.voiced += ms;
      }
    }
    opts.onSpeechProgress?.(this.voiced);
    const endSilenceMs =
      typeof opts.endSilenceMs === "function"
        ? opts.endSilenceMs()
        : (opts.endSilenceMs ?? DEFAULT_END_SILENCE_MS);
    const capped = this.time - this.began >= 14000;
    const silent = this.time - this.lastVoice >= endSilenceMs;
    if (!capped && (!silent || opts.shouldExtend?.())) {
      if (silent) this.lastVoice = this.time;
      return started ? { started: true, live } : { live };
    }
    const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const audio = new Float32Array(Math.min(length, this.rate * 15));
    let offset = 0;
    for (const chunk of this.chunks) {
      const part = chunk.subarray(0, Math.max(0, audio.length - offset));
      audio.set(part, offset);
      offset += part.length;
    }
    const usable = this.voiced >= 200,
      voicedMs = this.voiced;
    this.reset();
    this.cooldown = true;
    this.quiet = 0;
    return usable
      ? { audio, live, ended: true, voicedMs }
      : { live, ended: true, voicedMs };
  }
}
/** Mono float samples resampled to 24 kHz signed 16-bit, same math as the WAV path. */
export function pcm16Samples(
  samples: Float32Array,
  sourceRate: number,
  maxSamples = 360000,
): Int16Array {
  const length = Math.min(
    maxSamples,
    Math.floor((samples.length * 24000) / sourceRate),
  );
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const position = (i * sourceRate) / 24000,
      index = Math.floor(position),
      fraction = position - index;
    const sample =
      samples[index] * (1 - fraction) +
      (samples[Math.min(index + 1, samples.length - 1)] ?? 0) * fraction;
    const bounded = Math.max(-1, Math.min(1, sample));
    out[i] = Math.round(bounded * (bounded < 0 ? 32768 : 32767));
  }
  return out;
}
/** Streaming bytes for /voice-stream: raw PCM16 mono, no container. */
export function pcm16Bytes(
  samples: Float32Array,
  sourceRate: number,
): Uint8Array {
  const pcm = pcm16Samples(samples, sourceRate);
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}
export function voiceWav(samples: Float32Array, sourceRate: number): Blob {
  const pcm = pcm16Samples(samples, sourceRate);
  const bytes = new ArrayBuffer(44 + pcm.length * 2),
    view = new DataView(bytes);
  const word = (at: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  word(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  new Uint8Array(bytes, 44, pcm.length * 2).set(
    new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
  );
  return new Blob([bytes], { type: "audio/wav" });
}
