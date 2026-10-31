/** Split streamed reply text into speakable sentences for neural TTS. */
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "st",
  "ave",
  "blvd",
  "rd",
  "jr",
  "sr",
  "vs",
  "etc",
  "eg",
  "ie",
  "ex",
  "fig",
  "no",
  "ft",
  "oz",
  "lb",
  "tbsp",
  "tsp",
  "am",
  "pm",
]);
const CLOSERS = new Set(['"', "'", "”", "’", ")", "]", "}"]);
function isSpace(char: string): boolean {
  return char === " " || char === "\t" || char === "\r";
}
/** True when the period at index ends a sentence (never splits digits). */
function periodEnds(text: string, index: number): boolean {
  const before = text[index - 1] ?? "";
  const after = text[index + 1] ?? "";
  if (/\d/.test(before) && /\d/.test(after)) return false;
  const word = text.slice(0, index).match(/[A-Za-z]+$/)?.[0] ?? "";
  if (word.length === 1) return false;
  if (ABBREVIATIONS.has(word.toLowerCase())) return false;
  let next = index + 1;
  while (next < text.length && CLOSERS.has(text[next])) next++;
  while (next < text.length && isSpace(text[next])) next++;
  const followed = text[next] ?? "";
  if (!followed) return false;
  if (followed === "\n") return true;
  return /[A-Z0-9"“'‘([]/.test(followed);
}
export class SentenceStream {
  private buffer = "";
  /**
   * Feed streamed text; returns sentences completed by this push.
   * A boundary needs its trailing context, so the tail always stays
   * buffered until more text (or finish()) decides it.
   */
  push(delta: string): string[] {
    this.buffer += delta;
    const done: string[] = [];
    let end = -1;
    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];
      if (char === "\n") {
        end = i;
        break;
      }
      if (char === "!" || char === "?") {
        let next = i + 1;
        while (next < this.buffer.length && CLOSERS.has(this.buffer[next]))
          next++;
        if (
          next >= this.buffer.length ||
          (!isSpace(this.buffer[next]) && this.buffer[next] !== "\n")
        )
          continue;
        end = i;
        break;
      }
      if (char === "." && periodEnds(this.buffer, i)) {
        end = i;
        break;
      }
    }
    if (end < 0) return done;
    let cut = end + 1;
    while (cut < this.buffer.length && CLOSERS.has(this.buffer[cut])) cut++;
    while (cut < this.buffer.length && isSpace(this.buffer[cut])) cut++;
    if (this.buffer[cut] === "\n") cut++;
    const sentence = this.buffer.slice(0, cut).trim();
    this.buffer = this.buffer.slice(cut);
    if (sentence) done.push(sentence);
    return done.concat(this.push(""));
  }
  /** Flush any trailing fragment as one final sentence. */
  finish(): string[] {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest ? [rest] : [];
  }
}
