const objects: [RegExp, string][] = [
  [/\bmouse\b|మౌస్/iu, "computer mouse"],
  [/\bcable\b|కేబుల్/iu, "cable"],
  [/\bbottle\b|బాటిల్/iu, "bottle"],
  [/\bcup\b|కప్పు/iu, "cup"],
  [/\bphone\b|ఫోన్/iu, "phone"],
  [/\bkeyboard\b/iu, "keyboard"],
  [/\bscrewdriver\b/iu, "screwdriver"],
  [/\bhand\b|చేయి/iu, "hand"],
];
export function identifyTrackingObject(text: string): string | null {
  const matches = objects.filter(([pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][1] : null;
}
export function cancelsTracking(text: string): boolean {
  return /\b(don['’]?t|do not|stop|cancel|never mind|nevermind|not now|vaddu|cheyaku|cheyyaku|aapu)\b|వద్దు|ఆపు/iu.test(text);
}
export function clarifyTrackingObject(text: string): string | null {
  if (cancelsTracking(text) || text.length > 60 || /\b(what|which|why|how|where)\b/iu.test(text)) return null;
  return identifyTrackingObject(text);
}
/** A narrow local route for supported movement requests, not a general tool agent. */
export function trackingIntent(text: string): { concept: string | null } | null {
  if (/\b(order|package|shipment|expenses|fitness|flight|stock|song|music|time)\b/iu.test(text)) return null;
  if (cancelsTracking(text) || /\b(explain|what is|how (does|do|are))\b/iu.test(text)) return null;
  const movement = /\b(move|moved|moving|went)\b|కదిల/iu.test(text);
  const direction = /which (way|side|direction)|\b(ye|ee|e) side\b|ఏ.*వైపు/iu.test(text);
  const request = /\btrack\b|\b(check|show|analyze)\b.*\bmovement\b/iu.test(text) || (movement && (direction || text.includes("?")));
  return request ? { concept: identifyTrackingObject(text) } : null;
}
