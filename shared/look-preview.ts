import { z } from "zod";

export const lookPreviewInput = z.object({
  photo: z.string().max(810000),
  prompt: z.string().trim().min(3).max(1500),
  consent: z.literal(true),
  epoch: z.number().int().nonnegative(),
  requestId: z.string().uuid(),
});
export type LookPreviewInput = z.infer<typeof lookPreviewInput>;
export type LookPreviewResult = { image: string; epoch: number };

/** An offer only; recognizing an intent never captures or sends a photo. */
export function wantsLookPreview(text: string): boolean {
  if (/\b(text.only|just ideas|no photo|don'?t|do not|cancel)\b/i.test(text)) return false;
  if (/\bhow\b.*\b(remove|wash|clean|apply)\b/i.test(text) && !/\b(photo|picture|image)\b/i.test(text)) return false;
  return (/\b(halloween|costume|makeup|outfit)\b/i.test(text) && /\b(me|my|look|suit|try|wear|preview)\b/i.test(text)) ||
    (/\b(look|style|hairstyle)\b/i.test(text) && /\b(me|my)\b/i.test(text) && /\b(suit|suits|perfect|best|try|preview)\b/i.test(text)) ||
    (/\b(edit|preview|show|try)\b/i.test(text) && /\b(my photo|my picture|on me|my look)\b/i.test(text));
}
