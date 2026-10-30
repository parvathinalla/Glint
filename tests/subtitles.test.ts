import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSubtitlesEnabled, saveSubtitlesEnabled } from "../src/subtitles.ts";

describe("subtitle preference", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("defaults on and round-trips the toggle", () => {
    expect(loadSubtitlesEnabled()).toBe(true);
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
    saveSubtitlesEnabled(false);
    expect(loadSubtitlesEnabled()).toBe(false);
    saveSubtitlesEnabled(true);
    expect(loadSubtitlesEnabled()).toBe(true);
  });
  it("stays on when storage is missing or blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadSubtitlesEnabled()).toBe(true);
    expect(() => saveSubtitlesEnabled(false)).not.toThrow();
  });
});
