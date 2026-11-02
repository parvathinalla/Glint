import {traceServer} from "./diagnostics";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  canReport,
  demoInput,
  taskInput,
  type Feedback,
  type Task,
  type View,
} from "../shared/model.ts";
import { Problem, type Provider } from "./provider.ts";
import { VoiceStream, type AsrSocketFactory } from "./asr-provider.ts";
import { Store } from "./store.ts";
import { AgentProvider } from "./agent-provider.ts";
import { SamProvider, validateTrackingClip } from "./sam-provider.ts";
import { ImageProvider } from "./image-provider.ts";
import {ConditionProvider} from "./condition-provider";
import type {conditionInput} from "../shared/camera-tools";
import type {z} from "zod";
import type { LookPreviewInput } from "../shared/look-preview.ts";
import type { ObjectMotion, TrackInput } from "../shared/object-motion.ts";
import type {
  AgentInput,
  Turn,
  VideoFrame,
  VisualObservation,
  CameraEvent,
} from "../shared/agent.ts";

type Key = {
  raw: string;
  idleUntil: number;
  absoluteUntil: number;
  models: string[];
};
export type Session = {
  owner: string;
  csrf: string;
  task: Task | null;
  phase: View["phase"];
  epoch: number;
  key?: Key;
  controller?: AbortController;
  imageController?: AbortController;
  requestId?: string;
  keyController?: AbortController;
  calls: number;
  tokens: number;
  seen: Set<string>;
  lastSeen: number;
  busy: boolean;
  agentHistory: Turn[];
  agentSource?: Turn;
  visual?: VisualObservation;
  voice?: VoiceStream;
  motion?: ObjectMotion;
};
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const HOUR = 3600000;
export type VoiceSink = {
  partial: (text: string) => void;
  turn: (turnId: number, transcript: string) => void;
  final: (transcript: string) => void;
  error: (message: string) => void;
  gap: () => void;
  closed: (info: { code: number; retryable: boolean; reason?: string }) => void;
};
export type VoiceOptions = {
  socket?: AsrSocketFactory;
  sleep?: (ms: number) => Promise<void>;
  rand?: () => number;
};
/** One client frame holds at most ~1.3 s of provider-native PCM. */
export const MAX_VOICE_FRAME_BYTES = 64000;
/** Paid provider dispatches allowed per session before APP_LIMIT. */
export const MAX_SESSION_CALLS = 100;
export class Engine {
  private sessions = new Map<string, Session>();
  constructor(
    public store: Store,
    private provider: Provider,
    private now = Date.now,
    private agent = new AgentProvider(),
    private voiceOptions: VoiceOptions = {},
    private sam = new SamProvider(),
    private images = new ImageProvider(),
    private conditions = new ConditionProvider(),
  ) {}
  session(token?: string): { session: Session; token?: string } {
    const valid = token && /^[a-f0-9]{64}$/.test(token);
    const raw = valid ? token : randomBytes(32).toString("hex");
    const owner = hash(raw);
    let s = this.sessions.get(owner);
    if (!s) {
      if (this.sessions.size >= 200) {
        this.cleanup();
        if (this.sessions.size >= 200)
          throw new Problem(
            503,
            "CAPACITY",
            "Local session capacity reached. Try again later.",
          );
      }
      s = {
        owner,
        csrf: randomBytes(24).toString("hex"),
        task: this.store.load(owner),
        phase: "ready",
        epoch: 0,
        calls: 0,
        tokens: 0,
        seen: new Set(),
        lastSeen: this.now(),
        busy: false,
        agentHistory: [],
      };
      this.sessions.set(owner, s);
    }
    s.lastSeen = this.now();
    this.expireKey(s);
    return { session: s, token: valid ? undefined : raw };
  }
  existing(token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    const s = this.sessions.get(hash(token));
    if (s) this.expireKey(s);
    return s;
  }
  view(s: Session): View {
    this.expireKey(s);
    return {
      serverTime: this.now(),
      csrf: s.csrf,
      task: s.task,
      phase: s.phase,
      epoch: s.epoch,
      key: {
        connected: !!s.key,
        expiresAt: s.key
          ? Math.min(s.key.idleUntil, s.key.absoluteUntil)
          : undefined,
        models: s.key?.models ?? [],
      },
      calls: s.calls,
      limit: MAX_SESSION_CALLS,
      busy: s.busy||!!s.imageController,
      provider: "Meta Model API",
      capabilities: {
        image: "documented-not-live-tested",
        temporal: false,
        speechInput: "documented-not-live-tested",
        search: "documented-not-live-tested",
      },
    };
  }
  private expireKey(s: Session) {
    if (s.key && this.now() >= Math.min(s.key.idleUntil, s.key.absoluteUntil)) {
      this.cancel(s);
      delete s.key;
    }
  }
  cancel(s: Session) {
    delete s.motion;
    s.voice?.close();
    delete s.voice;
    if(s.controller||s.imageController)traceServer(s,{stage:"session",reason:"canceled",calls:s.calls});
    s.controller?.abort();
    s.imageController?.abort();
    s.keyController?.abort();
    s.epoch++;
  }
  phase(s: Session, phase: View["phase"]) {
    this.cancel(s);
    s.phase = phase;
    return this.view(s);
  }
  async connect(s: Session, key: string) {
    if (!/^[\x21-\x7e]{10,512}$/.test(key))
      throw new Problem(
        400,
        "KEY_FORMAT",
        "Enter a valid provider key. It will only be kept in session memory.",
      );
    if (s.keyController)
      throw new Problem(409, "BUSY", "Key validation is already in progress.");
    this.cancel(s);
    delete s.key;
    const controller = new AbortController();
    s.keyController = controller;
    try {
      const models = await this.provider.models(
        key,
        AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      );
      if (controller.signal.aborted)
        throw new Problem(409, "CANCELED", "Key connection was canceled.");
      if (!models.length)
        throw new Problem(
          400,
          "NO_MODEL",
          "This key has no supported Muse Spark models. No key was retained.",
        );
      s.key = {
        raw: key,
        idleUntil: this.now() + HOUR / 4,
        absoluteUntil: this.now() + HOUR * 2,
        models,
      };
      return this.view(s);
    } finally {
      delete s.keyController;
    }
  }
  resetCallSession(s: Session) {
    this.disconnect(s);
    s.busy=false;delete s.controller;delete s.imageController;delete s.requestId;
    s.calls=0;s.tokens=0;s.seen.clear();s.agentHistory=[];
    delete s.agentSource;delete s.visual;delete s.motion;
    s.phase="ready";
    traceServer(s,{stage:"session",operation:"session/reset",calls:s.calls});
    return this.view(s);
  }
  disconnect(s: Session) {
    this.cancel(s);
    delete s.key;
    return this.view(s);
  }
  setTask(s: Session, input: unknown, demo = false) {
    const parsed = taskInput.safeParse(demo ? demoInput : input);
    if (!parsed.success)
      throw new Problem(
        400,
        "TASK_INVALID",
        "Add an exact identity, source title, instructions (30+ characters), and 2–12 steps of at least 5 characters. URLs must use HTTPS.",
      );
    this.cancel(s);
    s.phase = "ready";
    delete s.visual;
    const v = parsed.data;
    const steps = v.steps.map((text, i) => ({
      id: `step-${i + 1}`,
      text,
      prereqs: i === 0 ? [] : [`step-${i}`],
      status: "pending" as const,
      anchor: `Reviewed instruction ${i + 1}`,
    }));
    if (demo) {
      steps[2].prereqs = ["step-1"];
      steps[3].prereqs = ["step-2", "step-3"];
    }
    s.task = {
      ...v,
      id: randomUUID(),
      revision: (s.task?.revision ?? 0) + 1,
      confirmed: false,
      sourceHash: hash(
        JSON.stringify({
          identity: v.identity,
          text: v.sourceText,
          steps: v.steps,
          url: v.sourceUrl,
        }),
      ),
      kind: demo ? "demo" : "user",
      steps,
      createdAt: this.now(),
    };
    this.store.save(s.owner, s.task);
    return this.view(s);
  }
  confirm(s: Session, revision: number) {
    if (!s.task || s.task.revision !== revision)
      throw new Problem(
        409,
        "TASK_CHANGED",
        "The instructions changed. Review and confirm them again.",
      );
    s.task.confirmed = true;
    this.store.save(s.owner, s.task);
    return this.view(s);
  }
  report(s: Session, id: string, done: boolean, revision: number) {
    const task = s.task;
    if (!task?.confirmed || task.revision !== revision)
      throw new Problem(
        409,
        "TASK_CHANGED",
        "Confirm the current source before reporting progress.",
      );
    const step = task.steps.find((x) => x.id === id);
    if (!step)
      throw new Problem(404, "STEP_UNKNOWN", "This step does not exist.");
    if (done && !canReport(step, task))
      throw new Problem(
        409,
        "PREREQUISITE",
        "Report the prerequisite steps first, or revise the source if the order differs.",
      );
    this.cancel(s);
    step.status = done ? "user-reported" : "pending";
    // Undo invalidates any downstream reports, including transitive dependencies.
    let changed = true;
    while (changed) {
      changed = false;
      for (const st of task.steps)
        if (st.status === "user-reported" && !canReport(st, task)) {
          st.status = "pending";
          changed = true;
        }
    }
    task.revision++;
    this.store.save(s.owner, task);
    return this.view(s);
  }
  forget(s: Session) {
    this.cancel(s);
    delete s.key;
    s.task = null;
    s.agentHistory = [];
    delete s.agentSource;
    delete s.visual;
    s.phase = "ready";
    this.store.save(s.owner, null);
    return this.view(s);
  }
  resetConversation(s: Session) {
    this.cancel(s);
    s.agentHistory = [];
    delete s.agentSource;
    delete s.visual;
    s.task = null;
    s.phase = "ready";
    this.store.save(s.owner, null);
    return this.view(s);
  }
  private async agentCall<T>(
    s: Session,
    epoch: number,
    requestId: string,
    lane: "converse" | "observe" | "transcribe" | "track" | "image" | "condition",
    work: (key: string, signal: AbortSignal) => Promise<T>,
  ) {
    this.expireKey(s);
    if (s.epoch !== epoch)
      throw new Problem(
        409,
        "CANCELED",
        "The session changed. Please try again.",
      );
    if (!s.key)
      throw new Problem(
        401,
        "KEY_REQUIRED",
        "Connect Muse Spark to talk with Glint.",
      );
    const imageLane=lane==="image";
    if (s.busy || (imageLane&&s.imageController) || (s.imageController&&!imageLane&&lane!=="converse"&&lane!=="transcribe"))
      throw new Problem(
        409,
        "BUSY",
        "Let the current request finish, or interrupt it first.",
      );
    if (s.seen.has(requestId))
      throw new Problem(409, "DUPLICATE", "This request was already sent.");
    if (s.calls >= MAX_SESSION_CALLS)
      throw new Problem(
        429,
        "APP_LIMIT",
        "The 100-call session allowance is used. No more work was sent.",
      );
    const controller = new AbortController();
    if(imageLane)s.imageController=controller;
    else {s.controller=controller;s.requestId=requestId;s.busy=true;}
    s.seen.add(requestId);
    s.calls++;
    s.lastSeen = this.now();
    s.key.idleUntil = Math.min(this.now() + HOUR / 4, s.key.absoluteUntil);
    const start = this.now();
    traceServer(s,{stage:"provider-start",operation:lane,requestId,calls:s.calls});
    try {
      const result = await work(
        s.key.raw,
        AbortSignal.any([controller.signal, AbortSignal.timeout(lane === "image" ? 120000 : 45000)]),
      );
      this.expireKey(s);
      if (controller.signal.aborted || s.epoch !== epoch)
        throw new Problem(
          409,
          "CANCELED",
          "Earlier feedback was discarded after the session changed.",
        );
      console.info(
        `[glint-timing] ${JSON.stringify({ scope: "server", lane, ms: this.now() - start })}`,
      );
      traceServer(s,{stage:"provider-end",operation:lane,requestId,calls:s.calls,durationMs:this.now()-start});
      return result;
    } catch(error){
      traceServer(s,{stage:"provider-error",operation:lane,requestId,calls:s.calls,status:error instanceof Problem?error.status:502,durationMs:this.now()-start,reason:controller.signal.aborted||s.epoch!==epoch?"canceled":error instanceof Problem&&error.code==="IMAGE_RESPONSE"?"invalid":"provider"});throw error;
    } finally {
      if(imageLane){if(s.imageController===controller)delete s.imageController;}
      else if(s.controller===controller){s.busy=false;delete s.controller;delete s.requestId;}
    }
  }
  cancelConversationRequest(s:Session,requestId:string){
    if(s.requestId===requestId)s.controller?.abort();
  }
  async converse(
    s: Session,
    input: AgentInput,
    onDelta?: (text: string) => void,
  ) {
    if (!s.key?.models.includes(input.model))
      throw new Problem(
        401,
        "MODEL_REQUIRED",
        "Connect Muse Spark and select an available model.",
      );
    const fresh = () =>
      !input.image ||
      (input.capturedAt !== undefined &&
        this.now() - input.capturedAt <= 5000 &&
        input.capturedAt <= this.now() + 1000);
    if (!fresh())
      throw new Problem(
        409,
        "STALE",
        "Take a fresh camera view before asking about it.",
      );
    if (input.frames) this.checkFrames(input.frames);
    const recent: Turn[] =
      s.visual && this.now() - s.visual.capturedAt < 15000
        ? [
            {
              role: "user",
              content: JSON.stringify({ recentVisualContext: s.visual }),
            },
          ]
        : [];
    if(s.motion && s.motion.epoch===s.epoch && this.now()-s.motion.to<15000)
      recent.push({role:"user",content:JSON.stringify({recordedObjectMotion:{
        concept:s.motion.concept,direction:s.motion.direction,reason:s.motion.reason,
        reference:s.motion.reference,from:s.motion.from,to:s.motion.to,
        instruction:"Recorded clip evidence only. Do not claim current or desk-relative motion; camera movement may affect it.",
      }})});
    if (input.events?.length)
      recent.push({
        role: "user",
        content: JSON.stringify({
          estimatedLocalPoseEvents: input.events.filter(
            (event) =>
              this.now() - event.at < 15000 && event.at <= this.now() + 1000,
          ),
        }),
      });
    const converseStarted=this.now();let firstConverseText=false;
    const result = await this.agentCall(
      s,
      input.epoch,
      input.requestId,
      "converse",
      (key, signal) =>
        this.agent.reply(
          key,
          input.model,
          [
            ...(s.agentSource ? [s.agentSource] : []),
            ...recent,
            ...s.agentHistory,
            ...(input.lookPreview?[{role:"user" as const,content:JSON.stringify({lookPreviewContext:input.lookPreview})}]:[]),
          ],
          input.question,
          input.url,
          input.image,
          signal,
          onDelta
            ? (text) => {
                if (s.epoch !== input.epoch || s.controller?.signal.aborted)
                  return;
                if(text&&!firstConverseText){firstConverseText=true;traceServer(s,{stage:"stream-first-text",operation:"converse",requestId:input.requestId,durationMs:this.now()-converseStarted});}
                onDelta(text);
              }
            : undefined,
          input.frames,
          input.cameraTools,
          durationMs=>traceServer(s,{stage:"provider-first-text",operation:"converse",requestId:input.requestId,durationMs}),
        ),
    );
    traceServer(s,{stage:"route",operation:"converse",requestId:input.requestId,action:result.action?.name??"answer",count:input.question.length});
    // A fresh-at-dispatch snapshot remains answerable; never label it live activity.
    if (input.url)
      s.agentSource = {
        role: "user",
        content: JSON.stringify({
          referenceOnly: true,
          url: input.url,
          retrievedSummary: result.message,
          sources: result.sources,
        }),
      };
    s.agentHistory = [
      ...s.agentHistory,
      {
        role: "user" as const,
        content:
          input.question +
          (input.url ? `\nInstructions link: ${input.url}` : ""),
      },
      {
        role: "assistant" as const,
        content:
          result.message +
          (result.sources.length
            ? "\nSources: " + result.sources.map((x) => x.url).join("\n")
            : ""),
      },
    ].slice(-12);
    return {
      ...result,
      epoch: s.epoch,
      ...(input.image || input.frames?.length
        ? {
            snapshot: {
              capturedAt: input.frames?.at(-1)?.capturedAt ?? input.capturedAt!,
            },
          }
        : {}),
    };
  }
  private checkFrames(frames: VideoFrame[]) {
    const last = frames.at(-1)!;
    if (
      this.now() - last.capturedAt > 5000 ||
      last.capturedAt > this.now() + 1000 ||
      last.capturedAt - frames[0].capturedAt > 12000 ||
      frames.some(
        (frame, i) => i > 0 && frame.capturedAt <= frames[i - 1].capturedAt,
      )
    )
      throw new Problem(
        409,
        "FRAMES_STALE",
        "The camera sequence is out of date. Capture a fresh view.",
      );
  }
  async observe(
    s: Session,
    input: {
      frames: VideoFrame[];
      model: string;
      epoch: number;
      requestId: string;
      events?: CameraEvent[];
    },
  ) {
    if (!s.key?.models.includes(input.model))
      throw new Problem(
        401,
        "MODEL_REQUIRED",
        "Connect Muse Spark to enable visual awareness.",
      );
    this.checkFrames(input.frames);
    const result = await this.agentCall(
      s,
      input.epoch,
      input.requestId,
      "observe",
      (key, signal) =>
        this.agent.observe(
          key,
          input.model,
          input.frames,
          s.visual,
          signal,
          [
            ...(s.agentSource ? [s.agentSource] : []),
            ...s.agentHistory.slice(-4),
          ],
          input.events?.filter(
            (event) =>
              this.now() - event.at < 15000 && event.at <= this.now() + 1000,
          ),
        ),
    );
    const observation: VisualObservation = {
      ...result,
      from: input.frames[0].capturedAt,
      capturedAt: input.frames.at(-1)!.capturedAt,
      epoch: s.epoch,
    };
    s.visual = observation;
    return observation;
  }
  clearVision(s: Session) {
    this.cancel(s);
    delete s.visual;
    delete s.motion;
    return this.view(s);
  }
  async trackMotion(s: Session,input: TrackInput) {
    validateTrackingClip(input,this.now());
    const result=await this.agentCall(s,input.epoch,input.requestId,"track",(key,signal)=>this.sam.track(key,input,signal));
    const motion: ObjectMotion={...result,concept:input.concept,from:input.from,to:input.to,epoch:s.epoch};
    s.motion=motion;
    return motion;
  }
  async previewLook(s: Session,input: LookPreviewInput) {
    const result=await this.agentCall(s,input.epoch,input.requestId,"image",(key,signal)=>this.images.edit(key,input.photo,input.prompt,signal));
    s.tokens+=result.tokens;
    // Photo bytes and generated images never enter agent history or SQLite.
    return {image:result.image,epoch:s.epoch};
  }
  async checkCondition(s:Session,input:z.infer<typeof conditionInput>){
    if(this.now()-input.capturedAt>5000||input.capturedAt>this.now()+1000)throw new Problem(409,"STALE","Capture a fresh camera frame for this check.");
    if(!s.key?.models.includes(input.model))throw new Problem(401,"MODEL_REQUIRED","Connect an available Muse Spark model.");
    const result=await this.agentCall(s,input.epoch,input.requestId,"condition",(key,signal)=>this.conditions.check(key,input.model,input.condition,input.photo,signal));
    return {...result,epoch:s.epoch,capturedAt:input.capturedAt};
  }
  async transcribe(
    s: Session,
    audio: Uint8Array,
    epoch: number,
    requestId: string,
  ) {
    return {
      transcript: await this.agentCall(s, epoch, requestId, "transcribe", (key, signal) =>
        this.agent.transcribe(key, audio, signal),
      ),
      epoch: s.epoch,
    };
  }
  voiceOpen(s: Session, epoch: number, requestId: string, sink: VoiceSink) {
    this.expireKey(s);
    if (s.epoch !== epoch) {
      console.warn(
        `[glint-voice] open rejected want=${epoch} have=${s.epoch} key=${!!s.key}`,
      );
      throw new Problem(
        409,
        "CANCELED",
        "The session changed. Please try again.",
      );
    }
    if (!s.key)
      throw new Problem(
        401,
        "KEY_REQUIRED",
        "Connect Muse Spark to talk with Glint.",
      );
    if (s.voice)
      throw new Problem(
        409,
        "BUSY",
        "A voice stream is already open for this session.",
      );
    if (s.seen.has(requestId))
      throw new Problem(409, "DUPLICATE", "This request was already sent.");
    if (s.calls >= MAX_SESSION_CALLS)
      throw new Problem(
        429,
        "APP_LIMIT",
        "The 100-call session allowance is used. No more work was sent.",
      );
    s.seen.add(requestId);
    if (s.seen.size > 100) s.seen.delete(s.seen.values().next().value!);
    const key = s.key.raw;
    const openEpoch = s.epoch;
    const streamStart = this.now();
    const current = () => s.epoch === openEpoch;
    const stream = new VoiceStream(
      key,
      {
        onPartial: (text) => {
          if (current()) sink.partial(text);
        },
        onTurn: (id, text) => {
          if (current()) sink.turn(id, text);
        },
        onFinal: (text) => {
          if (current()) sink.final(text);
        },
        onError: (message) => {
          if (current()) sink.error(message);
        },
        onGap: () => {
          if (current()) sink.gap();
        },
        onClosed: (info) => {
          if (s.voice === stream) delete s.voice;
          sink.closed(info);
        },
        isCurrent: current,
        chargeTurn: () => {
          if (!current() || !s.key || s.calls >= MAX_SESSION_CALLS) return false;
          s.calls++;
          s.lastSeen = this.now();
          s.key.idleUntil = Math.min(this.now() + HOUR / 4, s.key.absoluteUntil);
          console.info(
            `[glint-timing] ${JSON.stringify({ scope: "server", lane: "voice-stream", ms: this.now() - streamStart })}`,
          );
          return true;
        },
      },
      {
        socket: this.voiceOptions.socket,
        sleep: this.voiceOptions.sleep,
        now: this.now,
        rand: this.voiceOptions.rand,
      },
    );
    stream.open();
    s.voice = stream;
  }
  voiceFrame(s: Session, data: Uint8Array | string) {
    const voice = s.voice;
    if (!voice)
      throw new Problem(
        409,
        "CANCELED",
        "No voice stream is open for this session.",
      );
    if (typeof data === "string") {
      let control: unknown;
      try {
        control = JSON.parse(data);
      } catch {
        throw new Problem(
          400,
          "AUDIO_INVALID",
          "The voice control message is not valid JSON.",
        );
      }
      if (
        typeof control === "object" &&
        control !== null &&
        (control as { type?: unknown }).type === "end"
      ) {
        voice.end();
        return;
      }
      throw new Problem(
        400,
        "AUDIO_INVALID",
        "Unknown voice control message.",
      );
    }
    if (data.byteLength > MAX_VOICE_FRAME_BYTES)
      throw new Problem(
        400,
        "AUDIO_INVALID",
        "The voice frame is too large.",
      );
    voice.audio(data);
  }
  voiceClose(s: Session) {
    s.voice?.close();
    delete s.voice;
  }
  async respond(
    s: Session,
    input: {
      mode: "replay" | "live";
      question: string;
      model: string;
      revision: number;
      epoch: number;
      capturedAt: number;
      image?: string;
      requestId: string;
    },
    check: boolean,
  ): Promise<Feedback> {
    const task = s.task;
    if (
      !task?.confirmed ||
      task.revision !== input.revision ||
      s.epoch !== input.epoch
    )
      throw new Problem(
        409,
        "TASK_CHANGED",
        "The task or session changed. Please check again.",
      );
    if (check && s.phase !== "active")
      throw new Problem(
        409,
        "PAUSED",
        "Start the session before checking a view.",
      );
    if (s.busy||s.imageController)
      throw new Problem(
        409,
        "BUSY",
        "One observation is already being checked. No new work was queued.",
      );
    if (s.seen.has(input.requestId))
      throw new Problem(
        409,
        "DUPLICATE",
        "This observation was already submitted.",
      );
    if (
      check &&
      (this.now() - input.capturedAt > 5000 ||
        input.capturedAt > this.now() + 1000)
    )
      throw new Problem(
        409,
        "STALE",
        "The view is too old. Capture a fresh image.",
      );
    if (input.mode === "replay" && task.kind !== "demo")
      throw new Problem(
        400,
        "REPLAY_ONLY",
        "Replay is only available for the labeled example task.",
      );
    this.expireKey(s);
    if (
      input.mode === "live" &&
      (!s.key || !s.key.models.includes(input.model))
    )
      throw new Problem(
        401,
        "KEY_REQUIRED",
        "Connect your provider key and select an available model.",
      );
    if (s.calls >= MAX_SESSION_CALLS && input.mode === "live")
      throw new Problem(
        429,
        "APP_LIMIT",
        "The 100-call local session allowance is used. No further model work will be dispatched.",
      );
    const epoch = s.epoch;
    const controller = new AbortController();
    s.controller = controller;
    s.busy = true;
    s.seen.add(input.requestId);
    if (s.seen.size > 100) s.seen.delete(s.seen.values().next().value!);
    try {
      let decision;
      let tokens = 0;
      if (input.mode === "replay") {
        decision = {
          kind: "uncertain" as const,
          message: check
            ? "This is a replay, not an assessment of your camera. In the example, both side panels must be fitted before the back divider. The left and right panels can go in either order. Show me a clear view when you connect a model."
            : "For this example, lay out the parts first. Fit the left and right side panels in either order, then add the back divider. Mark only the work you have personally checked.",
          observations: check
            ? [
                "Replay contains an illustrated base and separate panels; no live scene was analyzed.",
              ]
            : [],
          stepIds: ["step-2", "step-3", "step-4"],
        };
      } else {
        const key = s.key!;
        key.idleUntil = Math.min(this.now() + HOUR / 4, key.absoluteUntil);
        s.calls++;
        const response = await this.provider.infer(
          key.raw,
          input.model,
          task,
          input.question,
          check ? input.image : undefined,
          AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
        );
        decision = response.decision;
        tokens = response.tokens;
        s.tokens += tokens;
      }
      this.expireKey(s);
      if (
        controller.signal.aborted ||
        s.epoch !== epoch ||
        s.task?.revision !== input.revision
      )
        throw new Problem(
          409,
          "CANCELED",
          "The session changed. Earlier feedback was discarded.",
        );
      if (check && this.now() - input.capturedAt > 5000)
        throw new Problem(
          409,
          "STALE",
          "Analysis arrived after the freshness limit. No current correction was delivered. Try a fresh view or use text for the manual.",
        );
      return {
        ...decision,
        mode: input.mode,
        evidenceId: randomUUID(),
        capturedAt: check ? input.capturedAt : this.now(),
        expiresAt: check ? input.capturedAt + 5000 : this.now() + 30000,
        revision: input.revision,
        epoch,
        tokens,
      };
    } finally {
      if (s.controller === controller) {
        s.busy = false;
        delete s.controller;
      }
    }
  }
  cleanup() {
    for (const [id, s] of this.sessions) {
      this.expireKey(s);
      if (this.now() - s.lastSeen > HOUR * 2) {
        this.cancel(s);
        this.sessions.delete(id);
      }
    }
    this.store.prune();
  }
  close() {
    for (const s of this.sessions.values()) {
      this.cancel(s);
      delete s.key;
    }
    this.sessions.clear();
    this.store.close();
  }
}
