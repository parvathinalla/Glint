/** Speak completed phrases while the remainder of the model response streams. */
const MAX_PHRASE = 200;
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
  private voices: SpeechSynthesisVoice[] = [];
  private voicesArmed = false;
  constructor(
    private changed: (speaking: boolean) => void,
    private onSpeak?: (phrase: string) => void,
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
    const clean = raw
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
      .replace(/[*#`]/g, "")
      .trim();
    if (clean) this.queue.push(...chunk(clean));
  }
  cancel() {
    this.generation++;
    this.queue = [];
    this.buffer = "";
    this.active = false;
    window.speechSynthesis?.cancel();
    this.changed(false);
  }
  private pump() {
    if (this.active || !this.queue.length || !("speechSynthesis" in window))
      return;
    const text = this.queue.shift()!;
    if (!text) {
      this.pump();
      return;
    }
    const version = this.generation,
      utterance = new SpeechSynthesisUtterance(text);
    this.ensureVoices(window.speechSynthesis);
    const voice = this.pickVoice();
    if (voice) utterance.voice = voice;
    this.active = true;
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
