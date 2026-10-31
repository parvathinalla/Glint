import { afterEach, expect, it, vi } from "vitest";
import { streamAgent } from "../src/agent-stream.ts";

function sseResponse(body: string, chunk = 0): Response {
  if (!chunk)
    return new Response(body, {
      headers: { "content-type": "text/event-stream" },
    });
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + chunk));
        offset += chunk;
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
function sse(...events: unknown[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}
afterEach(() => vi.unstubAllGlobals());

it("routes voice events and reports done separately from stream end", async () => {
  const seen: string[] = [];
  const voices: string[] = [];
  const audio: unknown[] = [];
  let voiceDone = 0,
    done = 0;
  vi.stubGlobal(
    "fetch",
    async () =>
      sseResponse(
        sse(
          { type: "voice", mode: "neural", sampleRate: 24000, voice: "mock" },
          { type: "delta", text: "Hello. " },
          {
            type: "audio",
            seq: 0,
            text: "Hello.",
            pcm: "AA==",
            sampleRate: 24000,
          },
          { type: "done", reply: { message: "Hello." } },
          { type: "voice-done" },
        ),
      ),
  );
  const reply = await streamAgent(
    "csrf",
    {},
    new AbortController().signal,
    (text) => seen.push(text),
    undefined,
    (mode) => voices.push(mode),
    (event) => audio.push(event),
    () => voiceDone++,
    () => done++,
  );
  expect(reply).toEqual({ message: "Hello." });
  expect(seen).toEqual(["Hello. "]);
  expect(voices).toEqual(["neural"]);
  expect(audio).toEqual([
    { type: "audio", seq: 0, text: "Hello.", pcm: "AA==", sampleRate: 24000 },
  ]);
  expect(done).toBe(1);
  expect(voiceDone).toBe(1);
});

it("accepts a multi-minute reply worth of audio events", async () => {
  const pcm = "AQ==".repeat(100000); // 300 KB, one long sentence
  let count = 0;
  vi.stubGlobal(
    "fetch",
    async () =>
      sseResponse(
        sse(
          { type: "voice", mode: "neural", sampleRate: 24000, voice: "mock" },
          {
            type: "audio",
            seq: 0,
            text: "Long.",
            pcm,
            sampleRate: 24000,
          },
          { type: "done", reply: { message: "Long." } },
          { type: "voice-done" },
        ),
        65536,
      ),
  );
  await streamAgent(
    "csrf",
    {},
    new AbortController().signal,
    () => {},
    undefined,
    undefined,
    () => count++,
  );
  expect(count).toBe(1);
});

it("surfaces error events and honors aborts", async () => {
  vi.stubGlobal(
    "fetch",
    async () => sseResponse(sse({ type: "error", message: "Nope." })),
  );
  await expect(
    streamAgent("csrf", {}, new AbortController().signal, () => {}),
  ).rejects.toThrow("Nope.");
  const controller = new AbortController();
  vi.stubGlobal("fetch", async (_url: string, init: { signal: AbortSignal }) => {
    init.signal.throwIfAborted();
    return sseResponse("");
  });
  controller.abort();
  await expect(
    streamAgent("csrf", {}, controller.signal, () => {}),
  ).rejects.toThrow();
});
