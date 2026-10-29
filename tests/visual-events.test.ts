import { expect, it } from "vitest";
import { VisualEventTracker, type Landmark } from "../shared/visual-events.ts";
function pose(raised = false): Landmark[] {
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
  }));
  points[15].y = raised ? 0.2 : 0.8;
  points[16].y = 0.8;
  return points;
}
it("recognizes stable arrival and hand-rise transitions without repeating held poses", () => {
  const tracker = new VisualEventTracker();
  expect(tracker.update(pose(), 0)).toEqual([]);
  expect(tracker.update(pose(), 600)).toEqual(["person-entered"]);
  expect(tracker.update(pose(), 900)).toEqual([]);
  expect(tracker.update(pose(true), 1000)).toEqual([]);
  expect(tracker.update(pose(true), 1400)).toEqual(["hand-raised"]);
  expect(tracker.update(pose(true), 10000)).toEqual([]);
  tracker.update(pose(), 10200);
  tracker.update(pose(), 11000);
  tracker.update(pose(true), 11500);
  expect(tracker.update(pose(true), 12000)).toEqual(["hand-raised"]);
});
it("ignores missing, low-visibility and single-frame poses", () => {
  const tracker = new VisualEventTracker();
  expect(tracker.update([], 0)).toEqual([]);
  expect(tracker.update(pose(true), 100)).toEqual([]);
  expect(tracker.update([], 300)).toEqual([]);
  const hidden = pose(true).map((point) => ({ ...point, visibility: 0.1 }));
  expect(tracker.update(hidden, 1500)).toEqual([]);
});
