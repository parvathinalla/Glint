import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowUp,
  Camera,
  CameraOff,
  Captions,
  Link,
  LoaderCircle,
  Maximize,
  Mic,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Spark } from "./Art.tsx";
import { asDataUrl, useCamera, encodeCameraFrames } from "./camera.ts";
import { useVisualAwareness } from "./visual-awareness.ts";
import type { VisualEvent } from "../shared/visual-events.ts";
import { useMicrophone } from "./microphone.ts";
import { streamAgent } from "./agent-stream.ts";
import { SpeechQueue } from "./speech-queue.ts";
import { BargeGuard } from "./barge-guard.ts";
import {
  StreamTurns,
  VoiceClient,
  isStreamingVoiceEnabled,
} from "./voice-stream.ts";
import { isEchoTranscript } from "./echo.ts";
import {
  loadSubtitlesEnabled,
  saveSubtitlesEnabled,
} from "./subtitles.ts";
import { logTiming, type VoiceTurnTiming } from "../shared/timing.ts";
import type { View } from "../shared/model.ts";
import {
  publicLink,
  type AgentReply,
  type VideoFrame,
  type VisualObservation,
  type CameraEvent,
} from "../shared/agent.ts";

type Api = (
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
) => Promise<unknown>;
type Message = {
  who: "you" | "glint";
  text: string;
  sources?: AgentReply["sources"];
  streaming?: boolean;
  interrupted?: boolean;
  note?: string;
  snapshot?: AgentReply["snapshot"];
};
/** Attached when a turn falls back to the WAV upload, so the fallback is never silent. */
const VOICE_FALLBACK_NOTE =
  "Sent as a voice recording (live transcription unavailable).";
const voiceStreamUrl = () =>
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/voice-stream`;
export function CompanionHome({
  view,
  online,
  model,
  api,
  connect,
  onView,
  linkOpen,
  closeLink,
  example,
}: {
  view: View;
  online: boolean;
  model: string;
  api: Api;
  connect: () => void;
  linkOpen: boolean;
  closeLink: () => void;
  example: () => void;
  onView: (view: View) => void;
}) {
  const [problem, setProblem] = useState("");
  const [failed, setFailed] = useState<{
    text: string;
    url?: string;
    withImage: boolean;
  } | null>(null);
  const onProblem = useCallback((text: string) => setProblem(text), []);
  const camera = useCamera(onProblem);
  const [observing, setObserving] = useState(false),
    [awareness, setAwareness] = useState<VisualObservation | null>(null),
    [visionPaused, setVisionPaused] = useState(false);
  const visualJob = useRef(false),
    nextObservation = useRef(0),
    lastAutomaticSpeech = useRef(0);
  const lastModelSpeech = useRef(0),
    greetedOnCamera = useRef(false);
  const eventHistory = useRef<CameraEvent[]>([]);
  const pendingVisualEvent = useRef<{ event: VisualEvent; at: number } | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState("");
  const [partial, setPartial] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [subsOn, setSubsOn] = useState(loadSubtitlesEnabled);
  const [busy, setBusy] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [readAloud, setReadAloud] = useState(true);
  const [url, setUrl] = useState(""),
    [researching, setResearching] = useState(false);
  const aloud = useRef(readAloud);
  aloud.current = readAloud;
  const request = useRef<AbortController | null>(null),
    lock = useRef(false),
    generation = useRef(0);
  const current = useRef(view);
  current.current = view;
  const cameraActive = useRef(camera.active);
  cameraActive.current = camera.active;
  const voice = useRef<VoiceClient | null>(null),
    turns = useRef(new StreamTurns()),
    streamingMode = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const speech = useRef<SpeechQueue | null>(null);
  const pendingVoice = useRef<{
    capturedStartMs: number;
    asrFirstPartialMs?: number;
    duringSpeech: boolean;
  } | null>(null);
  const activeVoice = useRef<VoiceTurnTiming | null>(null);
  const bargeGuard = useRef<BargeGuard | null>(null);
  if (!bargeGuard.current) bargeGuard.current = new BargeGuard();
  if (!speech.current)
    speech.current = new SpeechQueue(setSpeaking, (phrase) => {
      bargeGuard.current?.markSpoke();
      const timing = activeVoice.current;
      if (timing && timing.playbackStartMs === undefined)
        timing.playbackStartMs = Date.now();
      setSubtitle(phrase);
    });
  const pause = useRef<Promise<void> | null>(null);
  const stopSpeech = useCallback(() => speech.current?.cancel(), []);
  async function send(
    text: string,
    instructionsUrl?: string,
    withImage = false,
    voiceInput?: { audio?: Blob; asrFinalMs?: number; note?: string },
  ) {
    if (lock.current) {
      if (visualJob.current) await interrupt(false);
      else return;
    }
    if (!current.current.key.connected) {
      connect();
      return;
    }
    const controller = new AbortController(),
      token = generation.current;
    request.current = controller;
    lock.current = true;
    let epoch = current.current.epoch;
    setBusy(true);
    setResearching(!!instructionsUrl);
    setProblem("");
    setFailed(null);
    stopSpeech();
    let echoSuspect = false;
    if (voiceInput) {
      activeVoice.current = {
        kind: "voice-turn",
        capturedStartMs: pendingVoice.current?.capturedStartMs ?? Date.now(),
      };
      if (voiceInput.asrFinalMs !== undefined)
        activeVoice.current.asrFinalMs = voiceInput.asrFinalMs;
      const firstPartial = pendingVoice.current?.asrFirstPartialMs;
      if (firstPartial !== undefined)
        activeVoice.current.asrFirstPartialMs = firstPartial;
      echoSuspect = pendingVoice.current?.duringSpeech ?? false;
      pendingVoice.current = null;
    }
    try {
      if (pause.current) await pause.current;
      if (controller.signal.aborted || token !== generation.current) return;
      epoch = current.current.epoch;
      if (voiceInput?.audio) {
        const encoded = (await asDataUrl(voiceInput.audio)).split(",")[1];
        const result = (await api(
          "voice",
          { audio: encoded, epoch, requestId: crypto.randomUUID() },
          "POST",
          controller.signal,
        )) as { transcript: string; epoch: number };
        if (
          controller.signal.aborted ||
          generation.current !== token ||
          result.epoch !== current.current.epoch
        )
          return;
        text = result.transcript;
        if (activeVoice.current)
          activeVoice.current.asrFinalMs = Date.now();
      }
      if (voiceInput && echoSuspect && !instructionsUrl) {
        const glint = messages
          .filter((item) => item.who === "glint")
          .slice(-3)
          .map((item) => item.text);
        if (isEchoTranscript(text, glint)) {
          // Speaker echo, not the user: answer nothing and keep it out of
          // the timing baseline. Fail-open — a real turn is never dropped
          // for a missing speech flag.
          activeVoice.current = null;
          return;
        }
      }
      let image: string | undefined,
        capturedAt: number | undefined,
        frames: VideoFrame[] | undefined;
      if (withImage) {
        let frame = await camera.sample();
        if (!frame) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          frame = await camera.sample();
        }
        if (frame) {
          frames = await encodeCameraFrames(camera.recent());
          capturedAt = frame.at;
        } else
          setProblem(
            "The camera is still preparing. Glint will answer without an image for this turn.",
          );
      }
      if (controller.signal.aborted || token !== generation.current) return;
      setQuestion("");
      setMessages((items) =>
        items.at(-1)?.who === "you" &&
        items.at(-1)?.text === (instructionsUrl || text)
          ? items
          : ([
              ...items,
              {
                who: "you",
                text: instructionsUrl || text,
                ...(voiceInput?.note ? { note: voiceInput.note } : {}),
              },
            ].slice(-20) as Message[]),
      );
      let streamed = false;
      const result = await streamAgent(
        current.current.csrf,
        {
          question: text,
          url: instructionsUrl,
          image,
          frames: frames?.length ? frames : undefined,
          events: camera.active
            ? eventHistory.current.filter(
                (event) => Date.now() - event.at < 15000,
              )
            : undefined,
          capturedAt,
          epoch,
          model: model || current.current.key.models[0],
          requestId: crypto.randomUUID(),
        },
        controller.signal,
        (delta) => {
          if (
            controller.signal.aborted ||
            token !== generation.current ||
            epoch !== current.current.epoch
          )
            return;
          streamed = true;
          setMessages((items) => {
            const last = items.at(-1);
            if (last?.streaming)
              return [
                ...items.slice(0, -1),
                { ...last, text: last.text + delta },
              ];
            return [
              ...items,
              {
                who: "glint",
                text: delta,
                streaming: true,
                snapshot: capturedAt ? { capturedAt } : undefined,
              },
            ].slice(-20) as Message[];
          });
          if (aloud.current) speech.current?.push(delta);
        },
        () => {
          const timing = activeVoice.current;
          if (timing && timing.modelFirstTokenMs === undefined)
            timing.modelFirstTokenMs = Date.now();
        },
      );
      if (
        controller.signal.aborted ||
        token !== generation.current ||
        result.epoch !== current.current.epoch
      )
        return;
      setMessages((items) => {
        const final: Message = {
          who: "glint",
          text: result.message,
          sources: result.sources,
          snapshot: result.snapshot,
        };
        return items.at(-1)?.streaming
          ? [...items.slice(0, -1), final]
          : [...items, final].slice(-20);
      });
      greetedOnCamera.current = true;
      if (instructionsUrl) closeLink();
      if (aloud.current) {
        if (!streamed) speech.current?.push(result.message);
        speech.current?.finish();
      }
    } catch (error) {
      if (!controller.signal.aborted && token === generation.current) {
        stopSpeech();
        mic.cancel();
        setMessages((items) =>
          items.map((item) =>
            item.streaming
              ? { ...item, streaming: false, interrupted: true }
              : item,
          ),
        );
        if (text.trim()) {
          setFailed({ text, url: instructionsUrl, withImage });
          if (!instructionsUrl) setQuestion((draft) => draft || text);
        }
        setProblem(
          error instanceof Error
            ? error.message
            : "Glint couldn’t finish that request.",
        );
      }
    } finally {
      if (voiceInput && activeVoice.current) {
        logTiming(activeVoice.current);
        activeVoice.current = null;
      }
      if (request.current === controller) {
        request.current = null;
        lock.current = false;
        setBusy(false);
        setResearching(false);
      }
    }
  }
  const sendRef = useRef(send);
  sendRef.current = send;
  const mic = useMicrophone(
    (audio) => {
      if (bargeGuard.current?.turnReady()) return;
      if (streamingMode.current) {
        const decision = turns.current.wavReady(audio);
        if (decision === "fallback")
          void send("", undefined, camera.active, {
            audio,
            note: VOICE_FALLBACK_NOTE,
          });
        return;
      }
      void send("", undefined, camera.active, { audio });
    },
    onProblem,
    () => {
      if (bargeGuard.current?.turnStarted()) return;
      pendingVoice.current = {
        capturedStartMs: Date.now(),
        duringSpeech: speaking,
      };
      if (streamingMode.current) {
        const flush = turns.current.started();
        if (flush) {
          voice.current?.closeStream();
          void send("", undefined, camera.active, {
            audio: flush,
            note: VOICE_FALLBACK_NOTE,
          });
        }
        setPartial("");
        if (voice.current) voice.current.open(current.current.epoch);
        else turns.current.streamFailed();
      }
      if (lock.current || speaking) {
        const timing = activeVoice.current;
        if (
          timing &&
          timing.playbackStartMs !== undefined &&
          timing.bargeDetectMs === undefined
        )
          timing.bargeDetectMs = Date.now();
        void interrupt(false);
        // interrupt() cancels local speech synchronously, so this mark lands
        // right after the playback stop it measures.
        const stopped = activeVoice.current;
        if (
          stopped &&
          stopped.bargeDetectMs !== undefined &&
          stopped.playbackStopMs === undefined
        )
          stopped.playbackStopMs = Date.now();
      }
    },
    speaking,
    {
      samples: (pcm) => voice.current?.audio(pcm),
      turnEnd: () => {
        if (turns.current.shouldEnd()) voice.current?.end();
      },
    },
  );
  const cancelWork = useCallback(() => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    lock.current = false;
    visualJob.current = false;
    setObserving(false);
    setBusy(false);
    setResearching(false);
    stopSpeech();
    setMessages((items) =>
      items.map((item) =>
        item.streaming
          ? { ...item, streaming: false, interrupted: true }
          : item,
      ),
    );
  }, [stopSpeech]);
  const cancel = useCallback(() => {
    cancelWork();
    mic.cancel();
  }, [cancelWork, mic.cancel]);
  function interrupt(endVoice: boolean, clearVision = false) {
    if (endVoice) mic.cancel();
    cancelWork();
    const operation = api(
      clearVision ? "vision/stop" : "phase",
      clearVision ? {} : { phase: "paused" },
    )
      .then((value) => {
        current.current = value as View;
        onView(value as View);
      })
      .catch(() => {
        mic.cancel();
        setProblem(
          "Couldn’t confirm the pause. Reconnect before trying again.",
        );
      });
    pause.current = operation;
    void operation.finally(() => {
      if (pause.current === operation) pause.current = null;
    });
    return operation;
  }
  useVisualAwareness(camera.video, camera.active, (event) => {
    pendingVisualEvent.current = { event, at: Date.now() };
    eventHistory.current = [
      ...eventHistory.current,
      { kind: event, at: Date.now() },
    ].slice(-4);
    if (visualJob.current) void interrupt(false);
  });
  const observationTick = useRef<() => Promise<void>>(async () => {});
  observationTick.current = async () => {
    if (
      !camera.active ||
      !current.current.key.connected ||
      !online ||
      mic.recording ||
      mic.preparing ||
      lock.current ||
      speaking
    )
      return;
    const event = pendingVisualEvent.current;
    if (event?.event === "person-entered" && greetedOnCamera.current)
      pendingVisualEvent.current = null;
    if (
      event &&
      !(event.event === "person-entered" && greetedOnCamera.current) &&
      Date.now() - event.at < 8000 &&
      Date.now() - lastAutomaticSpeech.current > 2500
    ) {
      pendingVisualEvent.current = null;
      const text =
        event.event === "hand-raised"
          ? "Hi! I saw you raise your hand."
          : "Hi! I can see you.";
      setMessages(
        (items) => [...items, { who: "glint", text }].slice(-20) as Message[],
      );
      if (aloud.current && mic.enabled) {
        speech.current?.push(text);
        speech.current?.finish();
      }
      lastAutomaticSpeech.current = Date.now();
      greetedOnCamera.current = true;
      nextObservation.current = Math.max(
        nextObservation.current,
        Date.now() + 1500,
      );
      return;
    }
    if (visionPaused || Date.now() < nextObservation.current) return;
    const recent = camera.recent();
    if (recent.length < 2) return;
    const controller = new AbortController(),
      token = generation.current,
      epoch = current.current.epoch;
    request.current = controller;
    lock.current = true;
    visualJob.current = true;
    setObserving(true);
    nextObservation.current = Date.now() + 6000;
    try {
      const frames = await encodeCameraFrames(recent);
      if (
        controller.signal.aborted ||
        token !== generation.current ||
        frames.length < 2
      )
        return;
      const submitMs = Date.now();
      const result = (await api(
        "observe",
        {
          frames,
          events: eventHistory.current.filter(
            (event) => Date.now() - event.at < 15000,
          ),
          model: model || current.current.key.models[0],
          epoch,
          requestId: crypto.randomUUID(),
        },
        "POST",
        controller.signal,
      )) as VisualObservation;
      if (
        controller.signal.aborted ||
        token !== generation.current ||
        result.epoch !== current.current.epoch
      )
        return;
      logTiming({
        kind: "observation",
        submitMs,
        returnMs: Date.now(),
        frameCount: frames.length,
      });
      setAwareness(result);
      if (
        result.say &&
        result.confidence !== "low" &&
        Date.now() - lastModelSpeech.current >= 8000 &&
        Date.now() - result.capturedAt < 12000
      ) {
        setMessages(
          (items) =>
            [...items, { who: "glint", text: result.say! }].slice(
              -20,
            ) as Message[],
        );
        if (aloud.current && mic.enabled) {
          speech.current?.push(result.say);
          speech.current?.finish();
        }
        lastAutomaticSpeech.current = Date.now();
        lastModelSpeech.current = Date.now();
        greetedOnCamera.current = true;
      }
    } catch (error) {
      if (!controller.signal.aborted && token === generation.current) {
        setVisionPaused(true);
        setProblem(
          error instanceof Error
            ? error.message
            : "Visual awareness paused. Reopen the camera to try again.",
        );
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        lock.current = false;
        visualJob.current = false;
        setObserving(false);
      }
    }
  };
  useEffect(() => {
    setAwareness(null);
    setVisionPaused(false);
    pendingVisualEvent.current = null;
    eventHistory.current = [];
    greetedOnCamera.current = messages.length > 0;
    lastModelSpeech.current = 0;
    nextObservation.current = Date.now() + 3200;
    if (!camera.active) return;
    const timer = setInterval(() => void observationTick.current(), 800);
    return () => clearInterval(timer);
  }, [camera.active]);
  useEffect(() => {
    if (!mic.enabled) {
      voice.current?.dispose();
      voice.current = null;
      streamingMode.current = false;
      turns.current.reset();
      setPartial("");
      return;
    }
    if (!isStreamingVoiceEnabled()) return;
    streamingMode.current = true;
    const fallback = (audio: Blob) =>
      void sendRef.current("", undefined, cameraActive.current, {
        audio,
        note: VOICE_FALLBACK_NOTE,
      });
    const finishStreamed = (transcript: string) => {
      if (!turns.current.finalArrived()) return;
      setPartial("");
      voice.current?.closeStream();
      if (!transcript.trim()) return;
      void sendRef.current(transcript, undefined, cameraActive.current, {
        asrFinalMs: Date.now(),
      });
    };
    const failStream = () => {
      const audio = turns.current.streamFailed();
      setPartial("");
      if (audio) fallback(audio);
      return audio;
    };
    const client = new VoiceClient(voiceStreamUrl(), {
      onOpened: () => {},
      onPartial: (text) => {
        const pending = pendingVoice.current;
        if (pending && pending.asrFirstPartialMs === undefined)
          pending.asrFirstPartialMs = Date.now();
        setPartial(text);
      },
      onTurn: (_id, transcript) => finishStreamed(transcript),
      onFinal: (transcript) => finishStreamed(transcript),
      // A shed-audio gap still ends in a final or a failure; nothing to show.
      onGap: () => {},
      onClosed: (info) => {
        const answered = failStream();
        if (!answered && info.reason === "allowance-exhausted")
          setProblem(
            "The 40-call session allowance is used. No more work was sent.",
          );
      },
      onError: (code, message) => {
        // Transient provider hiccup: the turn continues, so log it instead
        // of alarming the user; final or closed still reports the outcome.
        if (code === "ASR_ERROR") {
          console.warn(`[glint-voice] provider error: ${message}`);
          return;
        }
        failStream();
      },
    });
    voice.current = client;
    client.connect();
    return () => {
      if (voice.current === client) voice.current = null;
      client.dispose();
    };
  }, [mic.enabled]);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden") {
        cancel();
        camera.stop();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      cancel();
    };
  }, [cancel, camera.stop]);
  useEffect(() => {
    if (!view.key.connected || !online) {
      cancel();
      camera.stop();
    }
  }, [view.key.connected, online, cancel, camera.stop]);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [messages, busy]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (linkOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [linkOpen]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (question.trim()) void send(question.trim(), undefined, camera.active);
  }
  // Voice state machine, derived so it cannot disagree with the flags.
  const voiceState = mic.recording
    ? "listening"
    : speaking
      ? "speaking"
      : busy
        ? "processing"
        : "idle";
  const enterFullscreen = () => {
    setFullscreen(true);
    if (view.key.connected && !mic.enabled) void mic.start();
    else if (!view.key.connected) connect();
  };
  useEffect(() => {
    if (!speaking) setSubtitle("");
  }, [speaking]);
  useEffect(() => {
    if (!camera.active && !camera.starting) setFullscreen(false);
  }, [camera.active, camera.starting]);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [fullscreen]);
  return (
    <section className="companion-home" aria-label="Talk with Glint">
      <div className="companion-stage">
        <div className="hero-avatar">
          <Spark state={speaking ? "speaking" : busy ? "thinking" : "ready"} />
        </div>
        <h1>What are we working on?</h1>
        <p>Tell me, or show me with your camera.</p>
        <div className="companion-controls">
          <button
            className="button"
            disabled={camera.starting}
            onClick={() => {
              if (camera.active) {
                camera.stop();
                void interrupt(false, true);
              } else {
                setProblem("");
                void camera.start().then((ok) => {
                  if (ok) enterFullscreen();
                  else if (view.key.connected && !mic.enabled)
                    void mic.start();
                });
              }
            }}
          >
            {camera.active ? <CameraOff size={18} /> : <Camera size={18} />}
            {camera.starting
              ? "Opening camera…"
              : camera.active
                ? "Stop camera"
                : "Open camera"}
          </button>
          <button
            className="icon-button"
            aria-label={
              readAloud ? "Mute spoken replies" : "Enable spoken replies"
            }
            onClick={() => {
              aloud.current = !readAloud;
              setReadAloud(!readAloud);
              stopSpeech();
            }}
          >
            {readAloud ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
        </div>
        <p className="companion-status" role="status">
          {voiceState === "listening"
            ? "Listening…"
            : voiceState === "speaking"
              ? "Glint is speaking"
              : voiceState === "processing"
                ? researching
                  ? "Finding and reading instructions…"
                  : "Glint is thinking…"
                : mic.enabled
                  ? "Voice on · listening"
                  : ""}
        </p>
        {partial && <p className="companion-partial">{partial}</p>}
        {(busy || speaking) && (
          <button className="text-button" onClick={() => void interrupt(false)}>
            Interrupt
          </button>
        )}
        <div
          className={`companion-camera ${camera.active || camera.starting ? "is-active" : ""} ${fullscreen ? "is-fullscreen" : ""}`}
        >
          <video
            ref={camera.video}
            autoPlay
            muted
            playsInline
            aria-label="Your live camera preview"
          />
          {camera.active && (
            <>
              <div className="live-caption">
                <i /> Camera awareness on
              </div>
              <button
                className="button"
                disabled={busy || !online}
                onClick={() =>
                  void send(
                    "What can you see in this view? Help me identify what I’m working on; ask if unclear.",
                    undefined,
                    true,
                  )
                }
              >
                <Camera size={16} /> Ask about this view
              </button>
              {fullscreen ? (
                <div className="fullscreen-bar">
                  <button
                    className="icon-button"
                    aria-label={
                      subsOn ? "Turn subtitles off" : "Turn subtitles on"
                    }
                    aria-pressed={subsOn}
                    onClick={() => {
                      const next = !subsOn;
                      setSubsOn(next);
                      saveSubtitlesEnabled(next);
                    }}
                  >
                    <Captions size={19} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Exit full screen camera"
                    onClick={() => setFullscreen(false)}
                  >
                    <X size={19} />
                  </button>
                </div>
              ) : (
                <button
                  className="icon-button"
                  aria-label="View camera full screen"
                  onClick={enterFullscreen}
                >
                  <Maximize size={16} />
                </button>
              )}
              {fullscreen && subsOn && subtitle && (
                <p className="companion-subtitles" aria-hidden="true">
                  {subtitle}
                </p>
              )}
            </>
          )}
        </div>
        {camera.active && (
          <p className="companion-note">
            {visionPaused
              ? "Visual awareness paused · reopen the camera to resume"
              : observing
                ? "Following what’s happening…"
                : awareness?.activity
                  ? `Seeing: ${awareness.activity}`
                  : "Recent camera frames are analyzed automatically while the camera is on."}
          </p>
        )}
      </div>
      <div className="companion-chat">
        <div
          className="companion-transcript"
          ref={scroll}
          role="log"
          aria-label="Conversation with Glint"
          aria-live="polite"
        >
          {!messages.length && (
            <p className="conversation-greeting">
              Hi, I’m Glint. What would you like a hand with?
            </p>
          )}
          {messages.map((message, i) => (
            <div key={i} className={`companion-message from-${message.who}`}>
              <span>{message.who === "you" ? "You" : "Glint"}</span>
              <p>{message.text}</p>
              {message.streaming && <small>Replying…</small>}
              {message.interrupted && <small>Reply interrupted</small>}
              {message.note && <small>{message.note}</small>}
              {!!message.sources?.length && (
                <ul className="agent-sources">
                  {message.sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {busy && (
            <p className="companion-wait">
              <LoaderCircle className="spin" size={16} />
              {researching ? "Researching your link" : "One moment…"}
            </p>
          )}
        </div>
        {problem && (
          <div className="notice error" role="alert">
            <span>{problem}</span>
            {failed && (
              <button
                className="text-button"
                disabled={busy || !online}
                onClick={() =>
                  void send(
                    failed.text,
                    failed.url,
                    failed.withImage && camera.active,
                  )
                }
              >
                Retry
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Dismiss conversation message"
              onClick={() => setProblem("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="message-composer">
          <form className="companion-input" onSubmit={submit}>
            <label className="sr-only" htmlFor="companion-question">
              Message Glint
            </label>
            <input
              id="companion-question"
              value={question}
              maxLength={2000}
              placeholder="Or type a message…"
              onFocus={() => {
                if (lock.current || speaking) void interrupt(false);
              }}
              onChange={(event) => {
                stopSpeech();
                setQuestion(event.target.value);
              }}
            />
            <button
              aria-label="Send message"
              className="button primary"
              disabled={
                !question.trim() ||
                busy ||
                mic.recording ||
                mic.preparing ||
                !online
              }
            >
              <ArrowUp size={20} />
            </button>
          </form>
          <button
            className={`button primary talk-button ${mic.enabled ? "recording" : ""}`}
            aria-label={mic.enabled ? "End voice chat" : "Talk to Glint"}
            aria-pressed={mic.enabled}
            disabled={mic.preparing || !online}
            onClick={() => {
              speech.current?.unlock();
              if (!view.key.connected) {
                connect();
                return;
              }
              stopSpeech();
              if (mic.enabled) void interrupt(true);
              else void mic.start();
            }}
          >
            {mic.enabled ? <Square size={18} /> : <Mic size={18} />}
            <span className="talk-label">
              {mic.enabled
                ? "End voice chat"
                : mic.preparing
                  ? "Preparing…"
                  : "Talk to Glint"}
            </span>
          </button>
        </div>
        <p className="companion-note">
          Voice listens until you end the chat. Glint replies aloud as the
          answer arrives.
        </p>
        <button
          className="text-button companion-example"
          aria-label="Try desk organizer example"
          onClick={example}
        >
          Try the illustrated example <span>· no API key needed</span>
        </button>
      </div>
      <dialog
        ref={dialog}
        className="modal"
        aria-label="Add instructions link"
        onCancel={closeLink}
      >
        <header>
          <h2>Add instructions</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={closeLink}
          >
            <X size={20} />
          </button>
        </header>
        <p className="modal-intro">
          Paste a product page or manual. Glint will look for the instructions.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = publicLink.safeParse(url.trim());
            if (!parsed.success) {
              setProblem("Use a public HTTPS product or manual link.");
              return;
            }
            void send(
              "Read this product or manual link, find the relevant official instructions, and help me get started. Cite sources and ask only if essential details are missing.",
              parsed.data,
            );
          }}
        >
          <label htmlFor="instructions-link">Product or manual link</label>
          <input
            id="instructions-link"
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            maxLength={2000}
          />
          {problem && (
            <p role="alert" className="field-help">
              {problem}
            </p>
          )}
          <button className="button primary full" disabled={busy || !online}>
            <Link size={16} />
            {researching ? "Reading instructions…" : "Let Glint read it"}
          </button>
        </form>
        <p className="field-help">
          Optional. Public links only. Muse needs access to the page; blocked
          pages and some PDFs may not be readable.
        </p>
      </dialog>
    </section>
  );
}
