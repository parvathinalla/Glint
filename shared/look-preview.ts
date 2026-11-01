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

export function lookFollowup(text: string, request: string): {kind:"photo"|"style"|"dismiss"|"clarify";request:string}|null {
  if(!request)return null;
  const value=text.trim();
  const style=/\b(?:fairy|mermaid|witch|vampire|fantasy|celestial|glam|goth|zombie|pirate|angel|makeup|costume|outfit)\b|ఫెయిరీ|ఫాంటసీ|మేకప్|ফ্যান্টাসি|মেকআপ/i.test(value) ||
    /\b(?:make|change|add|remove|switch|replace)\b.{0,50}\b(?:cape|dress|makeup|hair|color|colour|outfit|look|hat|accessories|purple|blue|pink|dark|light)\b/i.test(value);
  const updated=style?(request+"\nLook preference: "+value).slice(-1500):request;
  if(/^(cancel|not now|no thanks)[.! ]*$/i.test(value) || /\b(?:cancel|close|skip|stop)\s+(?:the\s+)?(?:photo|image|look|preview)\b/i.test(value) || /\b(?:don'?t|do not)\s+(?:want|need|generate|create|make|edit)\s+(?:a |an |the |any )?(?:photo|image|picture|preview)\b/i.test(value) || /\b(?:no photo|no image|just ideas|text.only)\b/i.test(value))
    return {kind:"dismiss",request};
  if(/^no[.! ]*$/i.test(value))return {kind:"clarify",request};
  if(/^(yes|yeah|yes please|show me|okay|ok|go ahead)[.! ]*$/i.test(value) ||
    /\b(?:create|generate|make|show|see|want|give|render|draw|edit)\b.{0,90}\b(?:image|picture|photo|preview)\b/i.test(value) ||
    /\b(?:choose|select|upload|take|pick)\b.{0,35}\b(?:photo|picture|image)\b/i.test(value))
    return {kind:"photo",request:updated};
  if(style)return {kind:"style",request:updated};
  return null;
}

/** An offer only; recognizing an intent never captures or sends a photo. */
export function wantsLookPreview(text: string): boolean {
  if (/\b(text.only|just ideas|no photo|don'?t|do not|cancel)\b/i.test(text)) return false;
  if (/\bhow\b.*\b(remove|wash|clean|apply)\b/i.test(text) && !/\b(photo|picture|image)\b/i.test(text)) return false;
  return (/\b(halloween|costume|makeup|outfit)\b/i.test(text) && /\b(me|my|look|suit|try|wear|preview)\b/i.test(text)) ||
    /\b(?:choose|select|upload|take|pick)\b.{0,35}\b(?:photo|picture)\b/i.test(text) ||
    (/\b(look|style|hairstyle)\b/i.test(text) && /\b(me|my)\b/i.test(text) && /\b(suit|suits|perfect|best|try|preview)\b/i.test(text)) ||
    (/\b(edit|preview|show|try)\b/i.test(text) && /\b(my photo|my picture|on me|my look)\b/i.test(text));
}
