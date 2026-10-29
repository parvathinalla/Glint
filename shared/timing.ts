import { z } from "zod";

/**
 * Stage-0 baseline timing. These records carry numbers only: strict schemas
 * reject any transcript, frame, URL, or key content passed to logTiming.
 * Wall-clock Date.now() marks keep stages comparable across client/server;
 * TimingLog uses a monotonic clock for precise local durations.
 */
export const voiceTurnTiming = z
  .object({
    kind: z.literal("voice-turn"),
    capturedStartMs: z.number(),
    asrFirstPartialMs: z.number().optional(),
    asrFinalMs: z.number().optional(),
    modelFirstTokenMs: z.number().optional(),
    playbackStartMs: z.number().optional(),
    bargeDetectMs: z.number().optional(),
    playbackStopMs: z.number().optional(),
  })
  .strict();
export type VoiceTurnTiming = z.infer<typeof voiceTurnTiming>;

export const observationTiming = z
  .object({
    kind: z.literal("observation"),
    submitMs: z.number(),
    returnMs: z.number().optional(),
    frameCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ObservationTiming = z.infer<typeof observationTiming>;

export const timingRecord = z.union([voiceTurnTiming, observationTiming]);
export type TimingRecord = z.infer<typeof timingRecord>;

/** Monotonic per-turn stopwatch. Inject a fake clock in tests. */
export class TimingLog {
  private marks = new Map<string, number>();
  constructor(private clock: () => number = () => performance.now()) {}
  mark(stage: string): number {
    const t = this.clock();
    this.marks.set(stage, t);
    return t;
  }
  duration(from: string, to: string): number | undefined {
    const a = this.marks.get(from),
      b = this.marks.get(to);
    return a === undefined || b === undefined ? undefined : b - a;
  }
  snapshot(): Record<string, number> {
    return Object.fromEntries(this.marks);
  }
  reset() {
    this.marks.clear();
  }
}

/** Validate then log one timing record. Anything outside the numbers-only schemas is dropped, never logged. */
export function logTiming(record: unknown): void {
  const parsed = timingRecord.safeParse(record);
  if (!parsed.success) return;
  console.info(`[glint-timing] ${JSON.stringify(parsed.data)}`);
}

/** Whole-turn wall-clock spans for the baseline table. Unmeasured stages yield undefined, never invented numbers. */
export function voiceTurnDurations(t: VoiceTurnTiming) {
  const span = (a?: number, b?: number) =>
    a === undefined || b === undefined ? undefined : b - a;
  return {
    captureToAsr: span(t.capturedStartMs, t.asrFinalMs),
    captureToFirstPartial: span(t.capturedStartMs, t.asrFirstPartialMs),
    asrToFirstToken: span(t.asrFinalMs, t.modelFirstTokenMs),
    firstTokenToPlayback: span(t.modelFirstTokenMs, t.playbackStartMs),
    endToEnd: span(t.capturedStartMs, t.playbackStartMs),
    bargeStop: span(t.bargeDetectMs, t.playbackStopMs),
  };
}

export function observationDurations(t: ObservationTiming) {
  return {
    roundTrip:
      t.returnMs === undefined ? undefined : t.returnMs - t.submitMs,
  };
}
