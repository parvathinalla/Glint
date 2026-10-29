export type Landmark = { x: number; y: number; visibility?: number };
export type VisualEvent = "person-entered" | "hand-raised";
/** Stable transitions across frames, rather than one-frame gesture guesses. */
export class VisualEventTracker {
  private presentSince: number | null = null;
  private absentSince: number | null = null;
  private greeted = false;
  private raisedSince: number | null = null;
  private loweredSince: number | null = null;
  private handReported = false;
  private lastHand = -Infinity;
  update(points: Landmark[], at: number): VisualEvent[] {
    const visible = (i: number) =>
      !!points[i] && (points[i].visibility ?? 0) >= 0.7;
    const present =
      visible(11) && visible(12) && (visible(0) || visible(23) || visible(24));
    const events: VisualEvent[] = [];
    if (present) {
      this.absentSince = null;
      this.presentSince ??= at;
      if (!this.greeted && at - this.presentSince >= 600) {
        this.greeted = true;
        events.push("person-entered");
      }
    } else {
      this.presentSince = null;
      this.absentSince ??= at;
      if (at - this.absentSince > 2500) this.greeted = false;
    }
    const raised =
      present &&
      ((visible(15) && points[15].y < points[11].y - 0.1) ||
        (visible(16) && points[16].y < points[12].y - 0.1));
    if (raised) {
      this.loweredSince = null;
      this.raisedSince ??= at;
      if (
        !this.handReported &&
        at - this.raisedSince >= 350 &&
        at - this.lastHand >= 6000
      ) {
        this.handReported = true;
        this.lastHand = at;
        events.push("hand-raised");
      }
    } else {
      this.raisedSince = null;
      this.loweredSince ??= at;
      if (at - this.loweredSince >= 700) this.handReported = false;
    }
    return events.includes("hand-raised") ? ["hand-raised"] : events;
  }
}
