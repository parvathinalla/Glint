import { describe, expect, it } from "vitest";
import { boundFrames } from "../shared/buffer.ts";
describe("checkpoint ring resource bounds", () => {
  it("caps burst count while preserving the newest ordered evidence", () => {
    const frames = Array.from({ length: 100 }, (_, i) => ({
      at: 1000 + i,
      blob: { size: 100 },
    }));
    const stats = boundFrames(frames, 1100);
    expect(stats.count).toBe(32);
    expect(frames[0].at).toBe(1068);
    expect(stats.bytes).toBe(3200);
  });
  it("enforces byte and age limits, including a single oversize frame", () => {
    const frames = [
      { at: 0, blob: { size: 1 } },
      { at: 15000, blob: { size: 3 * 1024 * 1024 } },
      { at: 16000, blob: { size: 3 * 1024 * 1024 } },
    ];
    expect(boundFrames(frames, 16000).count).toBe(1);
    expect(frames[0].at).toBe(16000);
    expect(
      boundFrames([{ at: 16000, blob: { size: 5 * 1024 * 1024 } }], 16000)
        .count,
    ).toBe(0);
  });
  it("releases expired context rather than retaining samples indefinitely", () => {
    const frames = [{ at: 1000, blob: { size: 12345 } }];
    expect(boundFrames(frames, 15000)).toEqual({
      count: 0,
      bytes: 0,
      evicted: 1,
    });
  });
});
