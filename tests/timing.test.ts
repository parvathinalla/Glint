import { describe, expect, it, vi } from "vitest";
import {
  TimingLog,
  logTiming,
  observationDurations,
  voiceTurnDurations,
} from "../shared/timing.ts";

describe("stage-0 timing instrumentation", () => {
  it("measures stage durations on a monotonic fake clock", () => {
    let t = 1000;
    const log = new TimingLog(() => t);
    log.mark("capturedStart");
    t += 1200;
    log.mark("asrFinal");
    t += 800;
    log.mark("modelFirstToken");
    expect(log.duration("capturedStart", "asrFinal")).toBe(1200);
    expect(log.duration("asrFinal", "modelFirstToken")).toBe(800);
    expect(log.duration("capturedStart", "missing")).toBeUndefined();
    expect(log.snapshot()).toEqual({
      capturedStart: 1000,
      asrFinal: 2200,
      modelFirstToken: 3000,
    });
  });
  it("derives voice-turn spans and leaves unmeasured stages undefined", () => {
    const d = voiceTurnDurations({
      kind: "voice-turn",
      capturedStartMs: 0,
      asrFinalMs: 1500,
    });
    expect(d.captureToAsr).toBe(1500);
    expect(d.asrToFirstToken).toBeUndefined();
    expect(d.endToEnd).toBeUndefined();
  });
  it("derives first-partial and barge-stop spans", () => {
    const d = voiceTurnDurations({
      kind: "voice-turn",
      capturedStartMs: 0,
      asrFirstPartialMs: 400,
      asrFinalMs: 1500,
      bargeDetectMs: 2000,
      playbackStopMs: 2005,
    });
    expect(d.captureToFirstPartial).toBe(400);
    expect(d.bargeStop).toBe(5);
    const e = voiceTurnDurations({ kind: "voice-turn", capturedStartMs: 0 });
    expect(e.captureToFirstPartial).toBeUndefined();
    expect(e.bargeStop).toBeUndefined();
  });
  it("accepts streaming and barge-in stages on voice turns", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      logTiming({
        kind: "voice-turn",
        capturedStartMs: 1,
        asrFirstPartialMs: 2,
        asrFinalMs: 3,
        bargeDetectMs: 4,
        playbackStopMs: 5,
      });
      expect(info).toHaveBeenCalledOnce();
    } finally {
      info.mockRestore();
    }
  });
  it("derives observation round-trip", () => {
    expect(
      observationDurations({
        kind: "observation",
        submitMs: 10,
        returnMs: 610,
        frameCount: 6,
      }).roundTrip,
    ).toBe(600);
    expect(
      observationDurations({ kind: "observation", submitMs: 10 }).roundTrip,
    ).toBeUndefined();
  });
  it("logs numbers-only records and drops anything carrying content", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      logTiming({ kind: "voice-turn", capturedStartMs: 1, asrFinalMs: 2 });
      expect(info).toHaveBeenCalledOnce();
      expect(info.mock.calls[0][0]).toContain("[glint-timing]");
      info.mockClear();
      logTiming({ kind: "voice-turn", capturedStartMs: 1, transcript: "hi" });
      logTiming({ kind: "observation", submitMs: 1, image: "data:..." });
      logTiming("not a record");
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });
});
