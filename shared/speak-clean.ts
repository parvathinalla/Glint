/**
 * Contractions proven missing from the Kokoro lexicon-us-en.txt
 * (grep-verified); the tokenizer skips them, dropping words from speech.
 */
const EXPANSIONS: Record<string, string> = {
  "what's": "what is",
  "what'd": "what did",
  "that's": "that is",
  "here's": "here is",
  "should've": "should have",
  "would've": "would have",
  "that'll": "that will",
  "there'll": "there will",
  "'til": "until",
};
function expandContractions(text: string): string {
  let out = text;
  for (const [from, to] of Object.entries(EXPANSIONS)) {
    const word = from.replace(/[.*+?^${}()|[\]\\']/g, "\\$&");
    out = out.replace(new RegExp(`(?<!\\w)${word}\\b`, "gi"), (match) =>
      /^[A-Z]/.test(match) ? to[0].toUpperCase() + to.slice(1) : to,
    );
  }
  return out;
}
/** Strip markdown and normalize to tokens the voices can speak. */
export function cleanSpeakText(raw: string): string {
  return expandContractions(
    raw
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
      .replace(/[*#`]/g, "")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, "...")
      .replace(/\s*—\s*/g, ", ")
      .replace(/\s*–\s*/g, " "),
  )
    .replace(/\s{2,}/g, " ")
    .trim();
}
