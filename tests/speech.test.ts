import { afterEach, expect, it, vi } from "vitest";
import { SpeechQueue } from "../src/speech-queue.ts";
import { NaturalReplyStream, naturalReply } from "../shared/natural-reply.ts";
afterEach(() => vi.unstubAllGlobals());
it("removes the obsolete duplicate lead even across token boundaries", () => {
  const cleaner = new NaturalReplyStream();
  const input =
    "In the image you shared: In the image you shared: You're stirring a bowl.";
  expect(
    [...input].map((letter) => cleaner.push(letter)).join("") +
      cleaner.finish(),
  ).toBe("You're stirring a bowl.");
  expect(naturalReply(input)).toBe("You're stirring a bowl.");
});
it("starts speaking complete phrases before the response finishes and cancels queued speech", () => {
  const spoken: { text: string; onend: () => void }[] = [],
    changed: boolean[] = [];
  const cancel = vi.fn();
  vi.stubGlobal("window", {
    speechSynthesis: {
      speak: (utterance: (typeof spoken)[number]) => spoken.push(utterance),
      cancel,
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  const queue = new SpeechQueue((value) => changed.push(value));
  queue.push("Hello. ");
  expect(spoken.map((x) => x.text)).toEqual(["Hello."]);
  queue.push("How can I help?");
  expect(spoken).toHaveLength(1);
  spoken[0].onend();
  expect(spoken).toHaveLength(2);
  queue.push("This must never play.");
  queue.cancel();
  spoken[1].onend();
  expect(spoken).toHaveLength(2);
  expect(cancel).toHaveBeenCalledOnce();
  expect(changed.at(-1)).toBe(false);
});
