import { SpeechQueue } from "./speech-queue.ts";
/**
 * Neural-voice kill switch: localStorage "glint-neural-voice" set to "0"
 * keeps per-device robot speech without a redeploy. Read fresh on every
 * call; anything unreadable means the neural voice stays on.
 */
export function isNeuralVoiceEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem("glint-neural-voice") !== "0";
  } catch {
    return true;
  }
}
export type VoiceAudio = {
  seq: number;
  text: string;
  pcm: string;
  sampleRate: number;
};
export type VoicePlaybackState = {
  ctx: "running" | "suspended" | "missing";
  queued: number;
  active: boolean;
  lastSeq: number;
  fallback: number;
};
type Queued = { buffer: AudioBuffer; text: string; seq: number };
/**
 * Plays the server's neural voice gaplessly and falls back to device
 * speech per sentence when synthesis or decoding fails. Mirrors the
 * SpeechQueue control surface (cancel/softStop/resume/finish/unlock) so
 * barge-in treats both voices alike.
 */
export class VoicePlayer {
  private ctx: AudioContext | null = null;
  private queue: Queued[] = [];
  private current: AudioBufferSourceNode | null = null;
  private active = false;
  private paused = false;
  private speaking = false;
  private generation = 0;
  private heardSeq = -1;
  private robot: SpeechQueue;
  private robotSpeaking = false;
  private fallbackCount = 0;
  constructor(
    private changed: (speaking: boolean) => void,
    private onSpeak?: (text: string) => void,
  ) {
    this.robot = new SpeechQueue((speaking) => {
      this.robotSpeaking = speaking;
      this.report();
    }, onSpeak);
  }
  /**
   * Create and resume the audio context from inside a user-gesture
   * handler (required on iOS, where audio never plays otherwise).
   * Safe to call on every tap.
   */
  unlock() {
    const ctx = this.ensureCtx();
    if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
    this.robot.unlock();
  }
  /** Snapshot for the on-screen voice note and tests. */
  getState(): VoicePlaybackState {
    return {
      ctx: !this.ctx ? "missing" : this.ctx.state === "running" ? "running" : "suspended",
      queued: this.queue.length,
      active: this.active,
      lastSeq: this.heardSeq,
      fallback: this.fallbackCount,
    };
  }
  /** Queue one synth'd sentence; corrupt payloads fall back to device speech. */
  playAudio(audio: VoiceAudio) {
    if (audio.seq <= this.heardSeq) return;
    this.heardSeq = audio.seq;
    // Mobile browsers suspend audio outside gestures (lock screen, tab
    // switch, calls); resume on arrival so playback never wedges silent.
    const ctx = this.ensureCtx();
    if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
    const buffer = this.decode(audio);
    if (!buffer) {
      this.audioError(audio.text);
      return;
    }
    this.queue.push({ buffer, text: audio.text, seq: audio.seq });
    this.report();
    this.pump();
  }
  /** Speak one failed sentence on the device voice, in stream order. */
  audioError(text: string) {
    this.fallbackCount++;
    this.robot.push(text);
    this.robot.finish();
  }
  /** No more audio is coming; drain the queue, then report idle. */
  finish() {
    this.heardSeq = -1;
    this.fallbackCount = 0;
    this.robot.finish();
    this.pump();
    this.report();
  }
  cancel() {
    this.generation++;
    this.stopCurrent();
    this.queue = [];
    this.heardSeq = -1;
    this.fallbackCount = 0;
    this.active = false;
    this.paused = false;
    this.robot.cancel();
    this.report();
  }
  /**
   * Halt audible speech instantly but keep the unheard queue for a
   * possible resume. Reports no speaking change; the caller resolves
   * with resume() or cancel().
   */
  softStop() {
    this.generation++;
    this.stopCurrent();
    this.active = false;
    this.paused = this.queue.length > 0;
    this.robot.softStop();
  }
  /** Resume a softStop() when the interruption proved to be echo. */
  resume() {
    this.paused = false;
    this.robot.resume();
    if (this.queue.length) this.pump();
    else this.report();
  }
  private ensureCtx(): AudioContext | null {
    if (!this.ctx && typeof window !== "undefined" && window.AudioContext) {
      try {
        this.ctx = new window.AudioContext();
      } catch {
        this.ctx = null;
      }
    }
    return this.ctx;
  }
  private decode(audio: VoiceAudio): AudioBuffer | null {
    try {
      const ctx = this.ensureCtx();
      if (!ctx) return null;
      const raw = atob(audio.pcm);
      if (!raw.length || raw.length % 2 !== 0) return null;
      const floats = new Float32Array(raw.length / 2);
      for (let i = 0; i < floats.length; i++) {
        const unsigned = raw.charCodeAt(i * 2) + raw.charCodeAt(i * 2 + 1) * 256;
        floats[i] = (unsigned > 32767 ? unsigned - 65536 : unsigned) / 32768;
      }
      const buffer = ctx.createBuffer(1, floats.length, audio.sampleRate);
      buffer.copyToChannel(floats, 0);
      return buffer;
    } catch {
      return null;
    }
  }
  private stopCurrent() {
    const current = this.current;
    this.current = null;
    if (current) {
      try {
        current.stop();
      } catch {
        /* Already ended; the stale onended is generation-guarded. */
      }
    }
  }
  private pump() {
    if (this.active || this.paused || !this.queue.length || !this.ctx) return;
    const next = this.queue.shift()!;
    const version = this.generation;
    const source = this.ctx.createBufferSource();
    source.buffer = next.buffer;
    source.connect(this.ctx.destination);
    source.onended = () => {
      if (version !== this.generation) return;
      this.current = null;
      this.active = false;
      if (this.queue.length && !this.paused) this.pump();
      else this.report();
    };
    this.current = source;
    this.active = true;
    this.report();
    this.onSpeak?.(next.text);
    window.dispatchEvent(
      new CustomEvent("glint-voice-audio", {
        detail: { seq: next.seq, text: next.text },
      }),
    );
    source.start();
  }
  private report() {
    const speaking =
      this.active ||
      this.robotSpeaking ||
      (!this.paused && this.queue.length > 0);
    if (speaking === this.speaking) return;
    this.speaking = speaking;
    this.changed(speaking);
  }
}
