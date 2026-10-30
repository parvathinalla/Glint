import { describe, expect, it } from "vitest";
import { isEchoTranscript } from "../src/echo.ts";

describe("echo transcript detection", () => {
  const glint = [
    "I can see you holding all your hair over to one side.",
    "Can you split that bundle into three even sections?",
  ];
  it("matches Glint's own words repeated back by the microphone", () => {
    expect(isEchoTranscript("holding", glint)).toBe(true);
    expect(isEchoTranscript("all your", glint)).toBe(true);
    expect(isEchoTranscript("holding all your hair", glint)).toBe(true);
  });
  it("matches misheard echo at half the significant words", () => {
    expect(isEchoTranscript("here over", glint)).toBe(true);
  });
  it("ignores case and punctuation", () => {
    expect(isEchoTranscript("Holding, ALL your hair!", glint)).toBe(true);
  });
  it("sends real user turns that do not overlap recent speech", () => {
    expect(isEchoTranscript("start", glint)).toBe(false);
    expect(
      isEchoTranscript("So what are the steps right now to braid?", glint),
    ).toBe(false);
  });
  it("sends fragments too short to judge and empty speech history", () => {
    expect(isEchoTranscript("up", glint)).toBe(false);
    expect(isEchoTranscript("", glint)).toBe(false);
    expect(isEchoTranscript("holding", [])).toBe(false);
  });
});
