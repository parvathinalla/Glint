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
  return objects.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
/** A narrow local route for supported movement requests, not a general tool agent. */
export function trackingIntent(text: string): { concept: string | null } | null {
  if (/\b(order|package|shipment|expenses|fitness|flight|stock|song|music|time)\b/iu.test(text)) return null;
  if (/\b(don['’]?t|do not|stop|cancel|explain|what is|how (does|do|are))\b/iu.test(text)) return null;
  const request = /\b(track|tracking|movement)\b|which (way|side|direction)|\b(move|moved|moving)\b.*\?|\b(ye|ee|e|which) side\b|ఏ.*వైపు|కదిల/iu.test(text);
  return request ? { concept: identifyTrackingObject(text) } : null;
}
