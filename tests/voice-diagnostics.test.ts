import { expect, it } from "vitest";
import { VoiceDiagnostics, voiceDiagnosticBatch } from "../shared/voice-diagnostics.ts";

it("records nothing without explicit activation and stops queueing after stop", () => {
  const log = new VoiceDiagnostics(() => 100);
  expect(log.record({ turn: 1, stage: "speech-start" })).toBeNull();
  log.start();
  log.record({ turn: 1, stage: "speech-start" });
  expect(log.snapshot()).toHaveLength(1);
  log.stop();
  expect(log.takeBatch()).toEqual([]);
  expect(log.record({ turn: 2, stage: "speech-start" })).toBeNull();
  expect(log.snapshot()).toHaveLength(1);
});

it("rejects content, invalid numbers and arbitrary labels before storing", () => {
  const log = new VoiceDiagnostics(); log.start();
  for (const extra of [{ transcript: "private" }, { key: "private" }, { audio: "private" }, { stage: "private" }, { durationMs: Infinity }]) {
    expect(log.record({ turn: 1, stage: "speech-start", ...extra } as Parameters<typeof log.record>[0])).toBeNull();
  }
  expect(log.snapshot()).toEqual([]);
  expect(voiceDiagnosticBatch.safeParse({ events: [{ turn: 1, stage: "speech-end", elapsedMs: 2, image: "private" }] }).success).toBe(false);
});

it("bounds records and batches, resets each run, and uses relative time", () => {
  let clock = 500; const log = new VoiceDiagnostics(() => clock); log.start();
  clock = 520;
  for (let turn = 1; turn <= 140; turn++) log.record({ turn, stage: "speech-start" });
  expect(log.snapshot()).toHaveLength(120);
  expect(log.snapshot()[0]).toEqual({ turn: 21, stage: "speech-start", elapsedMs: 20 });
  expect(log.takeBatch()).toHaveLength(30);
  expect(log.takeBatch()[0].turn).toBe(51);
  log.start();
  expect(log.snapshot()).toEqual([]);
  expect(log.takeBatch()).toEqual([]);
});
