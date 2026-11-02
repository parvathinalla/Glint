import { z } from "zod";

/** No arbitrary strings: diagnostics must never carry speech, keys or media. */
export const voiceDiagnostic = z.object({
  turn: z.number().int().min(0).max(1000000),
  stage: z.enum([
    "speech-start", "speech-end", "detector-drop", "speaker-check",
    "turn-accepted", "turn-rejected", "asr-partial", "asr-final",
    "reply-dispatched", "first-text", "audio-received", "device-fallback",
    "audio-scheduled", "device-playback-start", "playback-blocked", "interrupted",
    "transport-gap", "transport-closed",
    "playback-summary", "voice-unavailable",
  ]),
  elapsedMs: z.number().finite().min(0).max(86400000),
  durationMs: z.number().finite().min(0).max(86400000).optional(),
  reason: z.enum(["owner", "stranger", "unverified", "lock-off", "echo", "empty", "short", "canceled"]).optional(),
}).strict();
export type VoiceDiagnostic = z.infer<typeof voiceDiagnostic>;
export const voiceDiagnosticBatch = z.object({
  events: z.array(voiceDiagnostic).min(1).max(30),
}).strict();

/** Explicit, in-memory recording; bounded even during a long test. */
export class VoiceDiagnostics {
  private enabled = false;
  private started = 0;
  private records: VoiceDiagnostic[] = [];
  private pending: VoiceDiagnostic[] = [];
  constructor(private clock = () => performance.now()) {}
  start() {
    this.enabled = true;
    this.started = this.clock();
    this.records = [];
    this.pending = [];
  }
  stop() { this.enabled = false; this.pending = []; }
  record(input: Omit<VoiceDiagnostic, "elapsedMs">): VoiceDiagnostic | null {
    if (!this.enabled) return null;
    const event = voiceDiagnostic.safeParse({ ...input, elapsedMs: Math.round(this.clock() - this.started) });
    if (!event.success) return null;
    this.records.push(event.data);
    this.records = this.records.slice(-120);
    this.pending.push(event.data);
    this.pending = this.pending.slice(-120);
    return event.data;
  }
  snapshot() { return [...this.records]; }
  takeBatch() { return this.pending.splice(0, 30); }
}
