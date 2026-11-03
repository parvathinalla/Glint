import { SentenceStream } from "../shared/sentence-split.ts";
import { cleanSpeakText } from "../shared/speak-clean.ts";
import type { GlintVoice } from "./tts.ts";
export type TtsEvent =
  | { type: "voice"; mode: "none" }
  | { type: "voice"; mode: "neural"; sampleRate: number; voice: string }
  | {
      type: "audio";
      seq: number;
      text: string;
      pcm: string;
      sampleRate: number;
    }
  | { type: "audio-error"; seq: number; text: string };
/**
 * Synths reply sentences in order while the LLM stream is still coming
 * in. Sentences queue FIFO; finish() drains the tail before resolving,
 * and cancel() drops queued work and suppresses late in-flight audio.
 */
export class TtsStream {
  private sentences = new SentenceStream();
  private tail: Promise<void> = Promise.resolve();
  private seq = 0;
  private cancelled = false;
  private controller = new AbortController();
  private announced = false;
  private deviceOnly = false;
  constructor(
    private voice: GlintVoice,
    private emit: (event: TtsEvent) => void,
    private options: { onTiming?: (ms: number, chars: number, timing?: { queueMs: number; generationMs: number }) => void } = {},
  ) {}
  announce() {
    if (this.announced) return;
    this.announced = true;
    this.emit({
      type: "voice",
      mode: "neural",
      sampleRate: this.voice.sampleRate,
      voice: this.voice.name,
    });
  }
  push(delta: string) {
    if (this.cancelled) return;
    for (const sentence of this.sentences.push(delta))
      this.enqueue(sentence);
  }
  finish(): Promise<void> {
    if (!this.cancelled)
      for (const sentence of this.sentences.finish()) this.enqueue(sentence);
    return this.tail;
  }
  cancel() {
    this.cancelled = true;
    this.controller.abort();
  }
  private enqueue(raw: string) {
    const text = cleanSpeakText(raw);
    if (!text) return;
    this.tail = this.tail.then(async () => {
      if (this.cancelled) return;
      let emitted=false;
      const seq=this.seq++;
      // The installed Kokoro voice uses an English lexicon. Do not spend
      // CPU silently skipping Telugu words; let the device voice try them.
      if (this.deviceOnly || (this.voice.name === "kokoro-af-heart" && /[\u0C00-\u0C7F]/u.test(text))) {
        this.deviceOnly = true;
        this.emit({ type: "audio-error", seq, text });
        return;
      }
      try {
        const started = performance.now();
        const audio = await this.voice.synth(text, this.controller.signal,this.voice.streaming?(samples,sampleRate)=>{
          if(this.cancelled)return;
          this.emit({type:"audio",seq:emitted?this.seq++:seq,text:emitted?"":text,pcm:toPcm16Base64(samples),sampleRate});
          emitted=true;
        }:undefined);
        this.options.onTiming?.(
          Math.round(performance.now() - started),
          text.length,
          audio.timing,
        );
        if (this.cancelled||emitted) return;
        this.emit({
          type: "audio",
          seq,
          text,
          pcm: toPcm16Base64(audio.samples),
          sampleRate: audio.sampleRate,
        });
      } catch {
        if (this.cancelled) return;
        this.deviceOnly = true;
        // A partially played sentence must never be repeated in another voice.
        this.emit({ type: "audio-error", seq:emitted?this.seq++:seq, text:emitted?"":text });
      }
    });
  }
}
function toPcm16Base64(samples: Float32Array): string {
  const bytes = Buffer.allocUnsafe(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    bytes.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }
  return bytes.toString("base64");
}
