import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AgentProvider } from "../server/agent-provider.ts";
import { Engine } from "../server/engine.ts";
import { Store } from "../server/store.ts";
import { publicLink } from "../shared/agent.ts";

const engines: Engine[] = [];
afterEach(() => engines.splice(0).forEach((engine) => engine.close()));
function fixture(fetcher: typeof fetch) {
  const engine = new Engine(
    new Store(":memory:"),
    {
      models: async () => ["muse-spark-test"],
      infer: async () => {
        throw Error("Unexpected legacy inference");
      },
    },
    Date.now,
    new AgentProvider(fetcher),
  );
  engines.push(engine);
  return { engine, session: engine.session().session };
}
const answer = (text = "What would you like to work on?") =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
    }),
  );
describe("Muse companion and research contracts (fixtures, no live provider)", () => {
  it("compares an ordered camera sequence and carries the activity into conversation", async () => {
    const requests: Record<string, unknown>[] = [];
    const { engine, session } = fixture((async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      requests.push(request);
      if (request.text?.format?.name === "visual_observation")
        return answer(
          JSON.stringify({
            activity: "stirring ingredients in a bowl",
            scene: "A person holds a bowl and spoon.",
            changes: ["The spoon moves around the bowl across frames."],
            confidence: "high",
            say: null,
          }),
        );
      return answer("You're stirring ingredients in a bowl.");
    }) as typeof fetch);
    await engine.connect(session, "TEST_ONLY_KEY");
    const now = Date.now(),
      frames = [now - 2000, now - 1000, now].map((capturedAt) => ({
        image: "data:image/jpeg;base64,AAA",
        capturedAt,
      }));
    const observed = await engine.observe(session, {
      frames,
      epoch: session.epoch,
      requestId: randomUUID(),
      model: "muse-spark-test",
    });
    expect(observed.activity).toContain("stirring");
    const content = (requests[0].input as { content: { type: string }[] }[])[0]
      .content;
    expect(content.filter((item) => item.type === "input_image")).toHaveLength(
      3,
    );
    await engine.converse(session, {
      question: "What am I doing?",
      frames,
      epoch: session.epoch,
      model: "muse-spark-test",
      requestId: randomUUID(),
    });
    expect(JSON.stringify(requests[1].input)).toContain("recentVisualContext");
    expect(JSON.stringify(requests[1].input)).toContain("stirring ingredients");
    engine.clearVision(session);
    expect(session.visual).toBeUndefined();
    await expect(
      engine.observe(session, {
        frames: [...frames].reverse(),
        epoch: session.epoch,
        requestId: randomUUID(),
        model: "muse-spark-test",
      }),
    ).rejects.toMatchObject({ code: "FRAMES_STALE" });
  });
  it("retains delayed image answers as snapshots, while rejecting old images before dispatch", async () => {
    let now = 100000;
    const engine = new Engine(
      new Store(":memory:"),
      {
        models: async () => ["muse-spark-test"],
        infer: async () => {
          throw Error("Unexpected");
        },
      },
      () => now,
      new AgentProvider((async () => {
        now += 12000;
        return answer("I can see a bowl and ingredients.");
      }) as typeof fetch),
    );
    engines.push(engine);
    const session = engine.session().session;
    await engine.connect(session, "TEST_ONLY_KEY");
    const input = {
      question: "What am I doing?",
      image: "data:image/jpeg;base64,AAA",
      capturedAt: now,
      epoch: session.epoch,
      model: "muse-spark-test",
      requestId: randomUUID(),
    };
    const result = await engine.converse(session, input);
    expect(result.message).toBe("I can see a bowl and ingredients.");
    expect(result.snapshot?.capturedAt).toBe(100000);
    await expect(
      engine.converse(session, { ...input, requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: "STALE" });
  });
  it("delivers only visible text deltas and requires a completed streaming response", async () => {
    const events = [
      {
        type: "response.reasoning_text.delta",
        delta: "PRIVATE_REASONING_FIXTURE",
      },
      { type: "response.output_text.delta", delta: "Hello. " },
      { type: "response.output_text.delta", delta: "How can I help?" },
      {
        type: "response.completed",
        response: {
          status: "completed",
          output: [
            {
              type: "message",
              content: [
                { type: "output_text", text: "Hello. How can I help?" },
              ],
            },
          ],
        },
      },
    ];
    const provider = new AgentProvider((async (_url, init) => {
      expect(JSON.parse(String(init?.body)).stream).toBe(true);
      return new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    }) as typeof fetch);
    const parts: string[] = [];
    const result = await provider.reply(
      "TEST_ONLY_KEY",
      "muse-spark-test",
      [],
      "Hi",
      undefined,
      undefined,
      new AbortController().signal,
      (text) => parts.push(text),
    );
    expect(parts).toEqual(["Hello. ", "How can I help?"]);
    expect(result.message).toBe(parts.join(""));
  });
  it("reserves room for reasoning and accepts nullable optional response fields", async () => {
    const provider = new AgentProvider((async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.reasoning).toEqual({ effort: "minimal" });
      expect(request.max_output_tokens).toBe(4096);
      return new Response(
        JSON.stringify({
          status: "completed",
          incomplete_details: null,
          output: [
            { type: "reasoning", content: null, status: null },
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: "Let’s start with the ingredients.",
                  annotations: null,
                },
              ],
            },
          ],
        }),
      );
    }) as typeof fetch);
    expect(
      (
        await provider.reply(
          "TEST_ONLY_KEY",
          "muse-spark-test",
          [],
          "Help me cook",
          undefined,
          undefined,
          new AbortController().signal,
        )
      ).message,
    ).toContain("ingredients");
  });
  it("explains a response-token cutoff without speaking partial output or automatically retrying", async () => {
    let calls = 0;
    const provider = new AgentProvider((async () => {
      calls++;
      return new Response(
        JSON.stringify({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "Unfinished procedure" }],
            },
          ],
        }),
      );
    }) as typeof fetch);
    await expect(
      provider.reply(
        "TEST_ONLY_KEY",
        "muse-spark-test",
        [],
        "Help me",
        undefined,
        undefined,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "AGENT_TOKEN_LIMIT" });
    expect(calls).toBe(1);
  });
  it("talks without a task, retains bounded session context, and resets without disconnecting the key", async () => {
    const bodies: Record<string, unknown>[] = [];
    const { engine, session } = fixture((async (url, init) => {
      expect(url).toBe("https://api.meta.ai/v1/responses");
      bodies.push(JSON.parse(String(init?.body)));
      return answer();
    }) as typeof fetch);
    await engine.connect(session, "TEST_ONLY_KEY");
    const input = () => ({
      question: "Hello",
      model: "muse-spark-test",
      epoch: session.epoch,
      requestId: randomUUID(),
    });
    await engine.converse(session, input());
    await engine.converse(session, input());
    expect(session.task).toBeNull();
    expect(session.agentHistory).toHaveLength(4);
    expect(bodies[1].input).toHaveLength(3);
    expect(bodies[0].store).toBe(false);
    engine.resetConversation(session);
    expect(session.agentHistory).toEqual([]);
    expect(engine.view(session).key.connected).toBe(true);
  });
  it("uses search only for the optional URL and requires completed search plus safe citations", async () => {
    let searched = false;
    const provider = new AgentProvider((async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.tools).toEqual([
        { type: "web_search", search_context_size: "high" },
      ]);
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            ...(searched
              ? [{ type: "web_search_call", status: "completed" }]
              : []),
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: "The manual identifies these parts.",
                  annotations: [
                    {
                      type: "url_citation",
                      url: "https://www.ikea.com/manual.pdf",
                      title: "Manual",
                    },
                    {
                      type: "url_citation",
                      url: "javascript:alert(1)",
                      title: "Unsafe",
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );
    }) as typeof fetch);
    const run = () =>
      provider.reply(
        "TEST_ONLY_KEY",
        "muse-spark-test",
        [],
        "Read the manual",
        "https://www.ikea.com/product",
        undefined,
        new AbortController().signal,
      );
    await expect(run()).rejects.toMatchObject({ code: "SOURCE_UNVERIFIED" });
    searched = true;
    const reply = await run();
    expect(reply.searched).toBe(true);
    expect(reply.sources).toEqual([
      { title: "Manual", url: "https://www.ikea.com/manual.pdf" },
    ]);
    for (const url of [
      "http://www.ikea.com",
      "https://127.0.0.1",
      "https://localhost",
      "https://a.internal",
      "https://user:pass@www.ikea.com",
      "https://[::1]",
    ])
      expect(publicLink.safeParse(url).success).toBe(false);
  });
  it("rejects canceled results and enforces the shared 40-call limit", async () => {
    let release: (response: Response) => void = () => {};
    const { engine, session } = fixture(
      (() =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })) as typeof fetch,
    );
    await engine.connect(session, "TEST_ONLY_KEY");
    const request = () => ({
      question: "Hello",
      model: "muse-spark-test",
      epoch: session.epoch,
      requestId: randomUUID(),
    });
    const pending = engine.converse(session, request());
    engine.phase(session, "paused");
    release(answer());
    await expect(pending).rejects.toMatchObject({ code: "CANCELED" });
    expect(session.agentHistory).toEqual([]);
    session.calls = 40;
    await expect(engine.converse(session, request())).rejects.toMatchObject({
      code: "APP_LIMIT",
    });
  });
  it("uses Meta WAV transcription and sanitizes provider errors", async () => {
    const provider = new AgentProvider((async (url, init) => {
      expect(url).toBe("https://api.meta.ai/v1/asr/transcribe");
      const form = init?.body as FormData;
      const request = form.get("request") as Blob;
      expect(JSON.parse(await request.text())).toEqual({
        model: "muse-voice-transcribe-1.0",
        mode: "PUSH_TO_TALK",
        audioEncoding: "WAV",
      });
      expect(form.get("audio")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ transcript: "Help me with this." }));
    }) as typeof fetch);
    expect(
      await provider.transcribe(
        "TEST_ONLY_KEY",
        new Uint8Array(48),
        new AbortController().signal,
      ),
    ).toBe("Help me with this.");
    const failing = new AgentProvider(
      (async () =>
        new Response("private transcript and TEST_ONLY_KEY", {
          status: 401,
        })) as typeof fetch,
    );
    await expect(
      failing.transcribe(
        "TEST_ONLY_KEY",
        new Uint8Array(48),
        new AbortController().signal,
      ),
    ).rejects.toThrow("Muse could not complete");
  });
});
