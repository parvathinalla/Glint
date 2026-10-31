import { afterEach, describe, expect, it, vi } from "vitest";
import { loadKeyGateDismissed, saveKeyGateDismissed } from "../src/key-gate.ts";

describe("key gate dismissal", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("asks until dismissed, then stays quiet", () => {
    expect(loadKeyGateDismissed()).toBe(false);
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
    expect(loadKeyGateDismissed()).toBe(false);
    saveKeyGateDismissed();
    expect(loadKeyGateDismissed()).toBe(true);
  });
  it("keeps asking when storage is missing or blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadKeyGateDismissed()).toBe(false);
    expect(() => saveKeyGateDismissed()).not.toThrow();
  });
});
