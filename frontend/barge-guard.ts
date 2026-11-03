/**
 * Barge-in echo guard. Phone speakers retrigger the microphone as soon as
 * Glint starts talking, which would interrupt every reply and then upload
 * Glint's own voice as a user turn. A turn that starts within the grace
 * window after locally spoken audio begins is treated as probable echo: the
 * caller skips the interrupt and drops the turn audio. Later barge-ins still
 * work, and the explicit interrupt control is unaffected.
 *
 * The window is deliberately short: echo retrigger fires ~160-300 ms after a
 * phrase starts sounding (detector needs 160 ms above threshold), while a
 * human reacting to phrase content needs longer to start speaking. It must
 * stay under 600 ms so the "interrupt read-aloud" companion flow keeps working.
 */
export const ECHO_BARGE_GRACE_MS = 500;

export class BargeGuard {
  private lastSpeakAt = 0;
  private suppressed = false;
  constructor(
    private graceMs: number = ECHO_BARGE_GRACE_MS,
    private clock: () => number = Date.now,
  ) {}
  /** Record that spoken audio started playing (call on every phrase start). */
  markSpoke() {
    this.lastSpeakAt = this.clock();
  }
  /**
   * Record a detector turn start. Returns true when the turn is probable echo
   * and must neither interrupt in-flight work nor be sent.
   */
  turnStarted(): boolean {
    this.suppressed = this.clock() - this.lastSpeakAt < this.graceMs;
    return this.suppressed;
  }
  /**
   * Record a completed turn. Returns true when the audio must be dropped.
   * Consumes the latch so at most one turn is dropped per suppressed start.
   */
  turnReady(): boolean {
    const drop = this.suppressed;
    this.suppressed = false;
    return drop;
  }
}
