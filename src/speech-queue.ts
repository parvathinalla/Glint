/** Speak completed phrases while the remainder of the model response streams. */
export class SpeechQueue {
  private buffer = "";
  private queue: string[] = [];
  private active = false;
  private generation = 0;
  constructor(
    private changed: (speaking: boolean) => void,
    private onSpeak?: () => void,
  ) {}
  push(text: string) {
    this.buffer += text;
    let match: RegExpMatchArray | null;
    while ((match = this.buffer.match(/^([\s\S]*?[.!?](?:\s|$)|[\s\S]*?\n)/))) {
      this.queue.push(match[0]);
      this.buffer = this.buffer.slice(match[0].length);
    }
    this.pump();
  }
  finish() {
    if (this.buffer.trim()) this.queue.push(this.buffer);
    this.buffer = "";
    this.pump();
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
    const text = this.queue
      .shift()!
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
      .replace(/[*#`]/g, "")
      .trim();
    if (!text) {
      this.pump();
      return;
    }
    const version = this.generation,
      utterance = new SpeechSynthesisUtterance(text);
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
    this.onSpeak?.();
    window.speechSynthesis.speak(utterance);
  }
}
