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
it("soft-stops speech for a possible echo and resumes the remaining queue", () => {
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
  queue.push("First. Second. ");
  expect(spoken.map((x) => x.text)).toEqual(["First."]);
  queue.softStop();
  expect(cancel).toHaveBeenCalledOnce();
  expect(changed.at(-1)).toBe(true);
  spoken[0].onend();
  expect(spoken).toHaveLength(1);
  queue.resume();
  expect(spoken.map((x) => x.text)).toEqual(["First.", "Second."]);
  expect(changed.at(-1)).toBe(true);
});
it("drops the preserved queue when a soft stop is followed by cancel", () => {
  const spoken: { text: string; onend: () => void }[] = [],
    changed: boolean[] = [];
  vi.stubGlobal("window", {
    speechSynthesis: {
      speak: (utterance: (typeof spoken)[number]) => spoken.push(utterance),
      cancel: () => {},
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  const queue = new SpeechQueue((value) => changed.push(value));
  queue.push("First. Second. ");
  queue.softStop();
  queue.cancel();
  queue.resume();
  expect(spoken).toHaveLength(1);
  expect(changed.at(-1)).toBe(false);
});
it("unlocks with resume plus one silent utterance and loads voices", () => {
  const calls: string[] = [],
    texts: string[] = [],
    changed: boolean[] = [];
  let voiceLoads = 0;
  vi.stubGlobal("window", {
    speechSynthesis: {
      paused: false,
      speak: (utterance: { text: string }) => {
        calls.push("speak");
        texts.push(utterance.text);
      },
      resume: () => calls.push("resume"),
      cancel: () => calls.push("cancel"),
      getVoices: () => {
        voiceLoads++;
        return [];
      },
      addEventListener: () => {},
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  const queue = new SpeechQueue((value) => changed.push(value));
  queue.unlock();
  expect(calls).toEqual(["resume", "speak"]);
  expect(texts).toEqual([" "]);
  expect(changed).toEqual([]);
  expect(voiceLoads).toBe(1);
});
it("prefers a local voice over the network default when speaking", () => {
  const spoken: { text: string; voice?: unknown; onend: () => void }[] = [];
  const network = { name: "net", lang: "en-US", default: true, localService: false },
    local = { name: "local", lang: "en-US", default: false, localService: true };
  vi.stubGlobal("window", {
    speechSynthesis: {
      paused: false,
      getVoices: () => [network, local],
      addEventListener: () => {},
      speak: (utterance: (typeof spoken)[number]) => spoken.push(utterance),
      resume: () => {},
      cancel: () => {},
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      voice?: unknown;
      constructor(public text: string) {}
    },
  );
  const queue = new SpeechQueue(() => {});
  queue.push("Hi. ");
  expect(spoken).toHaveLength(1);
  expect(spoken[0].voice).toBe(local);
});
it("uses voices that arrive after the voiceschanged event", () => {
  const spoken: { text: string; voice?: unknown; onend: () => void }[] = [];
  const local = { name: "local", lang: "en-US", default: true, localService: true };
  let voices: unknown[] = [],
    listener = () => {};
  vi.stubGlobal("window", {
    speechSynthesis: {
      paused: false,
      getVoices: () => voices,
      addEventListener: (_type: string, fn: () => void) => {
        listener = fn;
      },
      speak: (utterance: (typeof spoken)[number]) => spoken.push(utterance),
      resume: () => {},
      cancel: () => {},
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      voice?: unknown;
      constructor(public text: string) {}
    },
  );
  const queue = new SpeechQueue(() => {});
  queue.push("Hi. ");
  expect(spoken[0].voice).toBeUndefined();
  voices = [local];
  listener();
  spoken[0].onend();
  queue.push("Again. ");
  expect(spoken).toHaveLength(2);
  expect(spoken[1].voice).toBe(local);
});
it("resumes a paused synthesizer before speaking each phrase", () => {
  const calls: string[] = [];
  const synth = {
    paused: true,
    speak: () => calls.push("speak"),
    resume: () => {
      calls.push("resume");
      synth.paused = false;
    },
    cancel: () => calls.push("cancel"),
  };
  vi.stubGlobal("window", { speechSynthesis: synth });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  const queue = new SpeechQueue(() => {});
  queue.push("Hi. ");
  expect(calls).toEqual(["resume", "speak"]);
});
it("chunks long phrases on iOS so no utterance exceeds the safe length", () => {
  const spoken: { text: string; onend: () => void }[] = [];
  vi.stubGlobal("navigator", {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  });
  vi.stubGlobal("window", {
    speechSynthesis: {
      paused: false,
      speak: (utterance: (typeof spoken)[number]) => spoken.push(utterance),
      resume: () => {},
      cancel: () => {},
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  const queue = new SpeechQueue(() => {});
  const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
  queue.push(words);
  queue.finish();
  for (let i = 0; i < spoken.length && i < 20; i++) spoken[i].onend();
  expect(spoken.length).toBeGreaterThan(1);
  for (const utterance of spoken)
    expect(utterance.text.length).toBeLessThanOrEqual(200);
  expect(spoken.map((utterance) => utterance.text).join(" ")).toBe(words);
});
it("speaks a long reply as whole sentences on desktop", () => {
  const spoken: { text: string; onend: () => void }[] = [];
  vi.stubGlobal("navigator", {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0",
  });
  vi.stubGlobal("window", {
    speechSynthesis: {
      paused: false,
      speak: (utterance: (typeof spoken)[number]) => spoken.push(utterance),
      resume: () => {},
      cancel: () => {},
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  const queue = new SpeechQueue(() => {});
  const words = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
  queue.push(`${words}. Next sentence here. `);
  queue.finish();
  for (const utterance of spoken) utterance.onend();
  expect(spoken.map((utterance) => utterance.text)).toEqual([
    `${words}.`,
    "Next sentence here.",
  ]);
});
it("reports each spoken phrase as it starts", () => {
  const phrases: string[] = [];
  const spoken: { text: string; onend: () => void }[] = [];
  vi.stubGlobal("window", {
    speechSynthesis: {
      paused: false,
      getVoices: () => [],
      addEventListener: () => {},
      speak: (utterance: (typeof spoken)[number]) => spoken.push(utterance),
      resume: () => {},
      cancel: () => {},
    },
  });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      onend: () => void = () => {};
      constructor(public text: string) {}
    },
  );
  const queue = new SpeechQueue(
    () => {},
    (phrase) => phrases.push(phrase),
  );
  queue.push("First. Second. ");
  queue.finish();
  expect(phrases).toEqual(["First."]);
  spoken[0].onend();
  expect(phrases).toEqual(["First.", "Second."]);
});
