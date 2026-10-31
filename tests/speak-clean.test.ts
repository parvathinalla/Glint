import { expect, it } from "vitest";
import { cleanSpeakText } from "../shared/speak-clean.ts";

it("strips markdown links and emphasis", () => {
  expect(cleanSpeakText("See [this](https://example.com) **now**.")).toBe(
    "See this now.",
  );
});

it("folds curly quotes and dashes to ASCII the lexicon can tokenize", () => {
  expect(cleanSpeakText("“Hey,” she said — ‘bye’…")).toBe(
    '"Hey," she said, \'bye\'...',
  );
  expect(cleanSpeakText("What’s up?")).toBe("What is up?");
});

it("expands contractions missing from the Kokoro lexicon", () => {
  expect(cleanSpeakText("What'd you wanna work on?")).toBe(
    "What did you wanna work on?",
  );
  expect(cleanSpeakText("That's great, here's the thing.")).toBe(
    "That is great, here is the thing.",
  );
  expect(cleanSpeakText("You should've seen it, they would've loved it.")).toBe(
    "You should have seen it, they would have loved it.",
  );
  expect(cleanSpeakText("Wait 'til morning.")).toBe("Wait until morning.");
  expect(cleanSpeakText("That'll work and there'll be time.")).toBe(
    "That will work and there will be time.",
  );
});

it("leaves covered contractions and plain text alone", () => {
  expect(cleanSpeakText("Don't worry, I'm here and you're fine.")).toBe(
    "Don't worry, I'm here and you're fine.",
  );
  expect(cleanSpeakText("  Hello there.  ")).toBe("Hello there.");
});
