import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine, type Session } from "../server/engine.ts";
import { Store } from "../server/store.ts";
import { MetaProvider, type Provider } from "../server/provider.ts";
import { demoInput, type Decision } from "../shared/model.ts";

const decision: Decision = {
  kind: "uncertain",
  message: "Could you show the left slot more clearly?",
  observations: ["The slot is partly obscured."],
  stepIds: ["step-2"],
};
const providers: Provider = {
  models: async () => ["muse-spark-test"],
  infer: async () => ({ decision, tokens: 30 }),
};
let clock = 1700000000000;
const engines: Engine[] = [];
function create(provider: Provider = providers, filename = ":memory:") {
  const e = new Engine(new Store(filename), provider, () => clock);
  engines.push(e);
  return e;
}
function prepared(e: Engine) {
  const { session: s } = e.session();
  e.setTask(s, null, true);
  e.confirm(s, s.task!.revision);
  e.phase(s, "active");
  return s;
}
function input(s: Session, mode: "replay" | "live" = "replay") {
  return {
    mode,
    question: "Check my view",
    model: "muse-spark-test",
    revision: s.task!.revision,
    epoch: s.epoch,
    capturedAt: clock,
    requestId: randomUUID(),
  };
}
afterEach(() => {
  engines.splice(0).forEach((e) => e.close());
  clock = 1700000000000;
});
describe("task and evidence policy", () => {
  it("requires confirmation before feedback and rejects stale graph versions", async () => {
    const e = create(),
      { session: s } = e.session();
    e.setTask(s, null, true);
    await expect(e.respond(s, input(s), true)).rejects.toMatchObject({
      code: "TASK_CHANGED",
    });
    e.confirm(s, s.task!.revision);
    e.phase(s, "active");
    const old = input(s);
    e.report(s, "step-1", true, s.task!.revision);
    await expect(e.respond(s, old, true)).rejects.toMatchObject({
      code: "TASK_CHANGED",
    });
  });
  it("rejects incomplete source and unsafe URL schemes", () => {
    const e = create(),
      { session: s } = e.session();
    expect(() => e.setTask(s, { ...demoInput, sourceText: "short" })).toThrow();
    expect(() =>
      e.setTask(s, { ...demoInput, sourceUrl: "javascript:alert(1)" }),
    ).toThrow();
  });
  it("allows either side-panel order but blocks a missing prerequisite and invalidates downstream undo", () => {
    const e = create(),
      s = prepared(e);
    expect(() => e.report(s, "step-4", true, s.task!.revision)).toThrow(
      /prerequisite/,
    );
    e.report(s, "step-1", true, s.task!.revision);
    e.report(s, "step-3", true, s.task!.revision);
    e.report(s, "step-2", true, s.task!.revision);
    e.report(s, "step-4", true, s.task!.revision);
    e.report(s, "step-1", false, s.task!.revision);
    expect(s.task!.steps.every((st) => st.status === "pending")).toBe(true);
  });
  it("never marks a replay step visually complete and rejects duplicate observations", async () => {
    const e = create(),
      s = prepared(e),
      request = input(s);
    const result = await e.respond(s, request, true);
    expect(result.mode).toBe("replay");
    expect(s.task!.steps.every((st) => st.status === "pending")).toBe(true);
    await expect(e.respond(s, request, true)).rejects.toMatchObject({
      code: "DUPLICATE",
    });
  });
  it("rejects old, future and paused evidence", async () => {
    const e = create(),
      s = prepared(e);
    await expect(
      e.respond(s, { ...input(s), capturedAt: clock - 5001 }, true),
    ).rejects.toMatchObject({ code: "STALE" });
    await expect(
      e.respond(s, { ...input(s), capturedAt: clock + 1001 }, true),
    ).rejects.toMatchObject({ code: "STALE" });
    e.phase(s, "paused");
    await expect(e.respond(s, input(s), true)).rejects.toMatchObject({
      code: "PAUSED",
    });
  });
});
describe("key lifecycle and dispatch", () => {
  it("never exposes raw keys in session views, tasks, or SQLite files; restarts recover only opted-in task", async () => {
    const dir = mkdtempSync(join(tmpdir(), "glint-test-"));
    const filename = join(dir, "progress.sqlite");
    try {
      const e = create(providers, filename),
        a = e.session(),
        s = a.session;
      e.setTask(s, { ...demoInput, remember: true });
      await e.connect(s, "TEST_ONLY_NOT_A_REAL_PROVIDER_KEY");
      const token = a.token!;
      expect(JSON.stringify(e.view(s))).not.toContain("TEST_ONLY");
      for (const f of readdirSync(dir))
        expect(
          readFileSync(join(dir, f)).includes(Buffer.from("TEST_ONLY")),
        ).toBe(false);
      const second = create(providers, filename),
        restored = second.session(token).session;
      expect(restored.task?.title).toBe(demoInput.title);
      expect(restored.key).toBeUndefined();
      expect(second.session().session.task).toBeNull();
    } finally {
      engines.splice(0).forEach((e) => e.close());
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("does not persist non-opted-in task or any images/transcripts", async () => {
    const e = create(),
      a = e.session();
    e.setTask(a.session, null, true);
    expect(e.store.load(a.session.owner)).toBeNull();
  });
  it("expires idle keys and explicitly disconnected keys", async () => {
    const e = create(),
      s = prepared(e);
    await e.connect(s, "TEST_ONLY_KEY");
    clock += 15 * 60000 + 1;
    expect(e.view(s).key.connected).toBe(false);
    await e.connect(s, "TEST_ONLY_KEY");
    e.disconnect(s);
    expect(e.view(s).key.connected).toBe(false);
  });
  it("permits only one in-flight job and cancels feedback after pause", async () => {
    let release!: (x: { decision: Decision; tokens: number }) => void;
    const e = create({
        ...providers,
        infer: () =>
          new Promise((r) => {
            release = r;
          }),
      }),
      s = prepared(e);
    await e.connect(s, "TEST_ONLY_KEY");
    const pending = e.respond(s, input(s, "live"), true);
    await expect(e.respond(s, input(s, "live"), true)).rejects.toMatchObject({
      code: "BUSY",
    });
    e.phase(s, "paused");
    release({ decision, tokens: 5 });
    await expect(pending).rejects.toMatchObject({ code: "CANCELED" });
    expect(s.busy).toBe(false);
  });
  it("discards slow observations and counts paid errors against the call cap without retry", async () => {
    const infer = vi.fn(async () => {
      clock += 6000;
      return { decision, tokens: 10 };
    });
    const e = create({ ...providers, infer }),
      s = prepared(e);
    await e.connect(s, "TEST_ONLY_KEY");
    await expect(e.respond(s, input(s, "live"), true)).rejects.toMatchObject({
      code: "STALE",
    });
    expect(infer).toHaveBeenCalledTimes(1);
    s.calls = 40;
    await expect(e.respond(s, input(s, "live"), true)).rejects.toMatchObject({
      code: "APP_LIMIT",
    });
    expect(infer).toHaveBeenCalledTimes(1);
  });
  it("does not let another session spend a connected key", async () => {
    const e = create(),
      a = prepared(e),
      b = prepared(e);
    await e.connect(a, "TEST_ONLY_KEY");
    await expect(e.respond(b, input(b, "live"), true)).rejects.toMatchObject({
      code: "KEY_REQUIRED",
    });
  });
});
describe("documented Meta contract and sanitized responses", () => {
  it("uses allowlisted endpoints, bearer auth, documented image block, and validates step references", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(
          JSON.stringify(
            String(url).endsWith("/models")
              ? { data: [{ id: "muse-spark-test" }, { id: "image-other" }] }
              : {
                  choices: [{ message: { content: JSON.stringify(decision) } }],
                  usage: { total_tokens: 44 },
                },
          ),
        );
      },
    );
    const p = new MetaProvider(fetcher as typeof fetch);
    expect(await p.models("TEST_ONLY_KEY")).toEqual(["muse-spark-test"]);
    const e = create(),
      s = prepared(e);
    await p.infer(
      "TEST_ONLY_KEY",
      "muse-spark-test",
      s.task!,
      "Is this clear?",
      "data:image/jpeg;base64,AAA",
      new AbortController().signal,
    );
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.meta.ai/v1/models",
      "https://api.meta.ai/v1/chat/completions",
    ]);
    expect(
      JSON.parse(String(calls[1].init!.body)).messages[1].content[1],
    ).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAA" },
    });
    expect(calls[1].init!.headers).toMatchObject({
      Authorization: "Bearer TEST_ONLY_KEY",
    });
  });
  it("does not surface provider bodies or malformed model decisions", async () => {
    const p = new MetaProvider(
      (async () =>
        new Response("secret: TEST_ONLY_KEY", { status: 401 })) as typeof fetch,
    );
    await expect(p.models("TEST_ONLY_KEY")).rejects.toThrow(
      "provider did not accept",
    );
    const e = create(),
      s = prepared(e);
    const bad = new MetaProvider(
      (async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    ...decision,
                    stepIds: ["invented"],
                  }),
                },
              },
            ],
          }),
        )) as typeof fetch,
    );
    await expect(
      bad.infer(
        "TEST_ONLY_KEY",
        "muse-spark-test",
        s.task!,
        "question",
        undefined,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "DECISION_INVALID" });
  });
});
describe("streaming voice lane", () => {
  class Socket {
    sent: (string | Uint8Array)[] = [];
    closed = false;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string | Uint8Array }) => void) | null = null;
    onclose: ((e: { code: number; reason: string }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    send(d: string | Uint8Array) {
      this.sent.push(d);
    }
    close() {
      this.closed = true;
    }
  }
  function voice() {
    const sockets: Socket[] = [];
    const sink: string[] = [];
    const e = new Engine(new Store(":memory:"), providers, () => clock, undefined, {
      socket: () => {
        const s = new Socket();
        sockets.push(s);
        return s;
      },
      sleep: () => Promise.resolve(),
      rand: () => 0,
    });
    engines.push(e);
    const { session: s } = e.session();
    const events = {
      partial: (text: string) => sink.push(`partial:${text}`),
      turn: (id: number, text: string) => sink.push(`turn:${id}:${text}`),
      final: (text: string) => sink.push(`final:${text}`),
      error: (m: string) => sink.push(`error:${m}`),
      gap: () => sink.push("gap"),
      closed: (info: { code: number; retryable: boolean; reason?: string }) =>
        sink.push(`closed:${info.code}:${info.retryable}:${info.reason ?? ""}`),
    };
    const open = (id = randomUUID()) =>
      e.voiceOpen(
        s,
        s.epoch,
        id,
        events,
      );
    const ack = () => {
      sockets[0].onopen!();
      sockets[0].onmessage!({ data: JSON.stringify({ sessionId: "srv" }) });
    };
    return { e, s, sockets, sink, open, ack };
  }
  it("requires a key, current epoch, and a free voice lane", async () => {
    const t = voice();
    await expect(
      (async () => t.open())(),
    ).rejects.toMatchObject({ code: "KEY_REQUIRED" });
    await t.e.connect(t.s, "TEST_ONLY_KEY");
    expect(() =>
      t.e.voiceOpen(t.s, t.s.epoch + 1, randomUUID(), {
        partial: () => {},
        turn: () => {},
        final: () => {},
        error: () => {},
        gap: () => {},
        closed: () => {},
      }),
    ).toThrowError(expect.objectContaining({ code: "CANCELED" }));
    t.open();
    expect(() => t.open()).toThrowError(
      expect.objectContaining({ code: "BUSY" }),
    );
  });
  it("rejects duplicate opens and exhausted allowances", async () => {
    const t = voice();
    await t.e.connect(t.s, "TEST_ONLY_KEY");
    const id = randomUUID();
    t.e.voiceOpen(t.s, t.s.epoch, id, {
      partial: () => {},
      turn: () => {},
      final: () => {},
      error: () => {},
      gap: () => {},
      closed: () => {},
    });
    t.e.voiceClose(t.s);
    expect(() =>
      t.e.voiceOpen(t.s, t.s.epoch, id, {
        partial: () => {},
        turn: () => {},
        final: () => {},
        error: () => {},
        gap: () => {},
        closed: () => {},
      }),
    ).toThrowError(expect.objectContaining({ code: "DUPLICATE" }));
    t.s.calls = 40;
    expect(() => t.open()).toThrowError(
      expect.objectContaining({ code: "APP_LIMIT" }),
    );
  });
  it("streams ready audio to the provider and charges finalized turns", async () => {
    const t = voice();
    await t.e.connect(t.s, "TEST_ONLY_KEY");
    t.open();
    t.ack();
    t.e.voiceFrame(t.s, new Uint8Array([7, 7]));
    expect(
      t.sockets[0].sent.filter((x) => x instanceof Uint8Array),
    ).toHaveLength(1);
    t.sockets[0].onmessage!({
      data: JSON.stringify({ type: "transcript", transcript: "salt?" }),
    });
    t.sockets[0].onmessage!({
      data: JSON.stringify({ type: "transcript", transcript: "salt?", final: true }),
    });
    expect(t.sink).toEqual(["partial:salt?", "final:salt?"]);
    expect(t.s.calls).toBe(1);
  });
  it("ends input on end control and rejects oversized frames", async () => {
    const t = voice();
    await t.e.connect(t.s, "TEST_ONLY_KEY");
    t.open();
    t.ack();
    t.e.voiceFrame(t.s, JSON.stringify({ type: "end" }));
    expect(JSON.parse(t.sockets[0].sent.at(-1) as string)).toEqual({
      type: "endStream",
    });
    expect(() => t.e.voiceFrame(t.s, new Uint8Array(200000))).toThrowError(
      expect.objectContaining({ code: "AUDIO_INVALID" }),
    );
    expect(() => t.e.voiceFrame(t.s, "{oops")).toThrowError();
  });
  it("discards stale audio after an epoch change and closes the socket", async () => {
    const t = voice();
    await t.e.connect(t.s, "TEST_ONLY_KEY");
    t.open();
    t.ack();
    t.e.phase(t.s, "paused");
    expect(t.sockets[0].closed).toBe(true);
    expect(() => t.e.voiceFrame(t.s, new Uint8Array([1]))).toThrowError(
      expect.objectContaining({ code: "CANCELED" }),
    );
  });
  it("pauses the stream with notice when the allowance runs out mid-turn", async () => {
    const t = voice();
    await t.e.connect(t.s, "TEST_ONLY_KEY");
    t.open();
    t.ack();
    t.s.calls = 40;
    t.sockets[0].onmessage!({
      data: JSON.stringify({ type: "transcript", transcript: "go", final: true }),
    });
    expect(t.sink).toEqual(["closed:1000:false:allowance-exhausted"]);
  });
  it("logs a server voice-stream span for finalized turns", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const t = voice();
      await t.e.connect(t.s, "TEST_ONLY_KEY");
      t.open();
      t.ack();
      t.sockets[0].onmessage!({
        data: JSON.stringify({
          type: "transcript",
          transcript: "go",
          final: true,
        }),
      });
      expect(
        info.mock.calls
          .map((call) => String(call[0]))
          .some((line) => line.includes('"lane":"voice-stream"')),
      ).toBe(true);
    } finally {
      info.mockRestore();
    }
  });
});
