import { cleanSpeakText } from "../shared/speak-clean.ts";
/** Speak completed phrases while the remainder of the model response streams. */
const MAX_PHRASE = 200;
/**
 * Chunked utterances add one scheduling gap per boundary, so chunk only on
 * iOS, where long utterances stall or truncate. Read lazily so tests can stub
 * the user agent per case.
 */
function needsChunks(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod/.test(navigator.userAgent ?? "")
  );
}
function chunk(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let part = "";
  for (const word of words) {
    const next = part ? `${part} ${word}` : word;
    if (next.length > MAX_PHRASE && part) {
      parts.push(part);
      part = word;
    } else part = next;
  }
  if (part) parts.push(part);
  return parts;
}
export class SpeechQueue {
  private buffer = "";
  private queue: string[] = [];
  private active = false;
  private generation = 0;
  private paused = false;
  private voices: SpeechSynthesisVoice[] = [];
  private voicesArmed = false;
  constructor(
    private changed: (speaking: boolean) => void,
    private onSpeak?: (phrase: string) => void,
    private onPlayback?: () => void,
  ) {}
  /**
   * Unlock platform speech from inside a user-gesture handler (required on
   * iOS, where speech never plays otherwise). Speaks one silent utterance and
   * starts voice loading. Touches no queue state and reports no speaking
   * change; safe to call on every tap.
   */
  unlock() {
    const synth = window.speechSynthesis;
    if (!synth) return;
    this.ensureVoices(synth);
    synth.resume?.();
    synth.speak(new SpeechSynthesisUtterance(" "));
  }
  private ensureVoices(synth: SpeechSynthesis) {
    if (this.voicesArmed) return;
    this.voicesArmed = true;
    const load = () => {
      this.voices = synth.getVoices?.() ?? [];
    };
    load();
    synth.addEventListener?.("voiceschanged", load);
  }
  /** Design doc: prefer a localService voice; fall back to default, then first. */
  private pickVoice(): SpeechSynthesisVoice | undefined {
    return (
      this.voices.find((v) => v.localService && v.default) ??
      this.voices.find((v) => v.localService && v.lang.startsWith("en")) ??
      this.voices.find((v) => v.localService) ??
      this.voices.find((v) => v.default) ??
      this.voices[0]
    );
  }
  push(text: string) {
    this.buffer += text;
    let match: RegExpMatchArray | null;
    while ((match = this.buffer.match(/^([\s\S]*?[.!?](?:\s|$)|[\s\S]*?\n)/))) {
      this.enqueue(match[0]);
      this.buffer = this.buffer.slice(match[0].length);
    }
    this.pump();
  }
  finish() {
    if (this.buffer.trim()) this.enqueue(this.buffer);
    this.buffer = "";
    this.pump();
  }
  private enqueue(raw: string) {
    const clean = cleanSpeakText(raw);
    if (clean) this.queue.push(...(needsChunks() ? chunk(clean) : [clean]));
  }
  cancel() {
    this.generation++;
    this.queue = [];
    this.buffer = "";
    this.active = false;
    this.paused = false;
    window.speechSynthesis?.cancel();
    this.changed(false);
  }
  /**
   * Halt audible speech instantly but keep the unheard queue for a possible
   * resume, for barge-ins that may still prove to be speaker echo. Reports no
   * speaking change; the caller resolves with resume() or cancel().
   */
  softStop() {
    this.generation++;
    if (this.buffer.trim()) this.enqueue(this.buffer);
    this.buffer = "";
    this.active = false;
    this.paused = true;
    window.speechSynthesis?.cancel();
  }
  /** Resume a softStop() when the interruption proved to be echo. */
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.pump();
  }
  private pump() {
    if (this.paused || this.active || !this.queue.length || !("speechSynthesis" in window))
      return;
    const text = this.queue.shift()!;
    if (!text) {
      this.pump();
      return;
    }
    const version = this.generation,
      utterance = new SpeechSynthesisUtterance(text);
    this.ensureVoices(window.speechSynthesis);
    const telugu = /[\u0C00-\u0C7F]/u.test(text);
    const voice = telugu
      ? this.voices.find(v => v.lang.toLowerCase().startsWith("te"))
      : this.pickVoice();
    if (telugu) utterance.lang = "te-IN";
    if (voice) utterance.voice = voice;
    this.active = true;
    utterance.onstart = () => {
      if (version === this.generation) this.onPlayback?.();
    };
    this.changed(true);
    utterance.onend = () => {
      if (version !== this.generation) return;
      this.active = false;
      if (this.queue.length) this.pump();
      else this.changed(false);
    };
    utterance.onerror = () => {
      if (version === this.generation) {
        this.active = false;
        this.queue = [];
        this.changed(false);
      }
    };
    this.onSpeak?.(text);
    if (window.speechSynthesis.paused) window.speechSynthesis.resume?.();
    window.speechSynthesis.speak(utterance);
  }
}
