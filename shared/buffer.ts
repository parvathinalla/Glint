export type SizedFrame = { at: number; blob: { size: number } };
// Stills for checkpoint context only; this ring makes no event-retention guarantee.
export function boundFrames<T extends SizedFrame>(frames: T[], now: number) {
  let bytes = frames.reduce((n, f) => n + f.blob.size, 0);
  let evicted = 0;
  while (
    frames.length &&
    (frames[0].at < now - 12000 ||
      bytes > 4 * 1024 * 1024 ||
      frames.length > 32)
  ) {
    bytes -= frames.shift()!.blob.size;
    evicted++;
  }
  return { count: frames.length, bytes, evicted };
}
