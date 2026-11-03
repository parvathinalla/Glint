/**
 * Echo suppression for transcribed turns. Phone speakers retrigger the
 * microphone seconds into a reply, past the barge guard's grace window, and
 * the transcript comes back as Glint's own words. A turn whose significant
 * words mostly appear in recent Glint speech is speaker echo, not the user.
 */
function significant(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}
export function isEchoTranscript(
  transcript: string,
  recentSpeech: string[],
): boolean {
  const words = significant(transcript);
  if (!words.length || !recentSpeech.length) return false;
  const spoken = new Set(significant(recentSpeech.join(" ")));
  const hits = words.filter((word) => spoken.has(word)).length;
  return hits / words.length >= 0.5;
}
