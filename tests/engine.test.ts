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
