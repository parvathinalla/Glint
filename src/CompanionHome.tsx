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
  SwitchCamera,
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
import { asDataUrl, useCamera, encodeCameraFrames } from "./camera.ts";
import { useVisualAwareness } from "./visual-awareness.ts";
import type { VisualEvent } from "../shared/visual-events.ts";
import {
  COMPLETE_END_SILENCE_MS,
  isTurnComplete,
  isTurnContinuation,
} from "../shared/voice-turn.ts";
import { useMicrophone } from "./microphone.ts";
import { streamAgent } from "./agent-stream.ts";
import { SpeechQueue } from "./speech-queue.ts";
import { VoicePlayer, isNeuralVoiceEnabled } from "./voice-player.ts";
import { BargeGuard } from "./barge-guard.ts";
import {
  StreamTurns,
  VoiceClient,
  isStreamingVoiceEnabled,
} from "./voice-stream.ts";
import { isEchoTranscript } from "./echo.ts";
import {
  SPEAKER_MIN_SECONDS,
  SpeakerCheckQueue,
  SpeakerEmbedder,
  averageVoiceprint,
  captureEnrollmentSample,
  clearVoiceprint,
  cosineSimilarity,
  isSpeakerLockEnabled,
  loadVoiceprint,
  resampleLinear,
  sampleHasSpeech,
  saveVoiceprint,
  verifyScore,
  wavBytesToMono16k,
  type SpeakerVerdict,
  type Voiceprint,
} from "./speaker-id.ts";
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
const voiceStreamUrl = () =>
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/voice-stream`;
/** Speech-start confirmation delay before server invalidation (stops pop churn). */
const BARGE_CONFIRM_MS = 300;
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
    nextObservation = useRef(0);
  const eventHistory = useRef<CameraEvent[]>([]);
  const pendingVisualEvent = useRef<{ event: VisualEvent; at: number } | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState("");
  const [partial, setPartial] = useState("");
  const [mlVadNote, setMlVadNote] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const [speakerNote, setSpeakerNote] = useState("");
  const [voiceprint, setVoiceprint] = useState<Voiceprint | null>(() =>
    isSpeakerLockEnabled() ? loadVoiceprint() : null,
  );
  const [enrolling, setEnrolling] = useState<{
    sample: number;
    total: number;
  } | null>(null);
  const speaker = useRef<SpeakerEmbedder | null>(null),
    speakerChecks = useRef(new SpeakerCheckQueue()),
    enrollCancel = useRef(false),
    enrollingRef = useRef(false),
    speakerNoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const voicePlayer = useRef<VoicePlayer | null>(null);
  const neuralReply = useRef(false);
  const replyDone = useRef(false);
  const pendingVoice = useRef<{
    capturedStartMs: number;
    asrFirstPartialMs?: number;
    duringSpeech: boolean;
  } | null>(null);
  const activeVoice = useRef<VoiceTurnTiming | null>(null);
  const bargeGuard = useRef<BargeGuard | null>(null);
  if (!bargeGuard.current) bargeGuard.current = new BargeGuard();
  const bargeAlive = useRef(false);
  const bargeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markSpoken = (phrase: string) => {
    bargeGuard.current?.markSpoke();
    const timing = activeVoice.current;
    if (timing && timing.playbackStartMs === undefined)
      timing.playbackStartMs = Date.now();
    setSubtitle(phrase);
  };
  if (!speech.current)
    speech.current = new SpeechQueue(setSpeaking, markSpoken);
  if (!voicePlayer.current)
    voicePlayer.current = new VoicePlayer(setSpeaking, markSpoken);
  const pause = useRef<Promise<void> | null>(null);
  const stopSpeech = useCallback((soft = false) => {
    if (soft) {
      speech.current?.softStop();
      voicePlayer.current?.softStop();
    } else {
      speech.current?.cancel();
      voicePlayer.current?.cancel();
    }
  }, []);
  const noteSpeaker = useCallback((text: string, sticky = false) => {
    if (speakerNoteTimer.current) {
      clearTimeout(speakerNoteTimer.current);
      speakerNoteTimer.current = null;
    }
    if (text) console.info(`[glint-voice] speaker lock: ${text}`);
    setSpeakerNote(text);
    if (text && !sticky)
      speakerNoteTimer.current = setTimeout(() => setSpeakerNote(""), 8000);
  }, []);
  const ensureSpeaker = () => {
    if (!speaker.current)
      speaker.current = new SpeakerEmbedder((reason) => {
        const detail = String(reason).slice(0, 90);
        noteSpeaker(
          `Speaker lock unavailable (${detail}); answering everyone.`,
          true,
        );
      });
    return speaker.current;
  };
  /**
   * Start an async owner/stranger check for one turn's audio. Runs beside
   * transcription (never ahead of it), so the owner never waits; short
   * turns, decode failures, and a missing lock all resolve null (allow).
   */
  function startSpeakerCheck(audio: Blob, voicedMs: number) {
    if (!isSpeakerLockEnabled()) return;
    const enrolled = loadVoiceprint();
    if (!enrolled) return;
    if (voicedMs < SPEAKER_MIN_SECONDS * 1000) {
      // Backchannel ("mm", "yes"): too little voice to verify, so allow
      // without consulting the model. The resolved check keeps FIFO order
      // aligned for streamed sends.
      speakerChecks.current.push(audio, Promise.resolve(null));
      return;
    }
    const promise = (async (): Promise<SpeakerVerdict | null> => {
      try {
        const bytes = new Uint8Array(await audio.arrayBuffer()),
          { samples } = wavBytesToMono16k(bytes);
        const embedding = await ensureSpeaker().embed(samples);
        if (!embedding) return null;
        const score = cosineSimilarity(embedding, enrolled.vector),
          verdict = verifyScore(score);
        console.info(
          `[glint-voice] speaker check: ${verdict} (score ${score.toFixed(2)})`,
        );
        return verdict;
      } catch {
        return null;
      }
    })();
    speakerChecks.current.push(audio, promise);
  }
  const ENROLL_SAMPLES = 2,
    ENROLL_SECONDS = 4,
    ENROLL_PROMPTS = [
      "Say: “Hey Glint, this is me.”",
      "Say: “Remember my voice.”",
    ];
  async function enrollVoice() {
    if (enrollingRef.current) return;
    enrollingRef.current = true;
    enrollCancel.current = false;
    const vectors: Float32Array[] = [];
    try {
      const embedder = ensureSpeaker();
      for (let sample = 0; sample < ENROLL_SAMPLES; sample++) {
        setEnrolling({ sample: sample + 1, total: ENROLL_SAMPLES });
        const { samples, sampleRate } =
          await captureEnrollmentSample(ENROLL_SECONDS);
        if (enrollCancel.current) return;
        const wave = resampleLinear(samples, sampleRate, 16000);
        if (!sampleHasSpeech(wave, 16000)) {
          noteSpeaker(
            "We couldn't hear you clearly — move closer and try again.",
          );
          return;
        }
        const embedding = await embedder.embed(wave);
        if (enrollCancel.current) return;
        if (!embedding) {
          noteSpeaker("Speaker lock unavailable; try again later.", true);
          return;
        }
        vectors.push(embedding);
      }
      setVoiceprint(saveVoiceprint(averageVoiceprint(vectors), vectors.length));
      noteSpeaker("");
    } catch (error) {
      noteSpeaker(
        error instanceof Error &&
          (error.name === "NotAllowedError" || error.name === "NotFoundError")
          ? "Microphone blocked — allow access to enroll your voice."
          : "Enrollment failed; try again.",
      );
    } finally {
      enrollingRef.current = false;
      setEnrolling(null);
    }
  }
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  function holdWakeLock() {
    const request = (
      navigator as Navigator & {
        wakeLock?: {
          request: (kind: "screen") => Promise<{
            release: () => Promise<void>;
          }>;
        };
      }
    ).wakeLock?.request;
    if (!request) return;
    request("screen")
      .then((sentinel) => {
        wakeLock.current = sentinel;
      })
      .catch(() => undefined);
  }
  function releaseWakeLock() {
    wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
  }
  async function send(
    text: string,
    instructionsUrl?: string,
    withImage = false,
    voiceInput?: { audio?: Blob; asrFinalMs?: number; note?: string },
  ) {
    if (lock.current) {
      if (visualJob.current || voiceInput) await interrupt(false);
      else {
        return;
      }
    }
    if (!current.current.key.connected) {
      connect();
      return;
    }
    if (request.current) {
      generation.current++;
      request.current.abort();
      request.current = null;
      setMessages((items) =>
        items.map((item) =>
          item.streaming ? { ...item, streaming: false } : item,
        ),
      );
    }
    replyDone.current = false;
    const controller = new AbortController(),
      token = generation.current;
    request.current = controller;
    lock.current = true;
    const speakerCheck = voiceInput
      ? speakerChecks.current.claim(voiceInput.audio)
      : null;
    let deferredSpeechCancel = false;
    if (speakerCheck && speakerCheck.settled === undefined)
      void speakerCheck.promise.then((verdict) => {
        if (verdict !== "stranger") return;
        if (token !== generation.current || request.current !== controller)
          return;
        // A stranger's turn, proven mid-flight: kill it. Before the first
        // reply token the interrupted speech is still preserved, so it
        // resumes like any false trigger; after, stop the partial reply.
        activeVoice.current = null;
        if (deferredSpeechCancel) {
          deferredSpeechCancel = false;
          cancelWork(true);
          speech.current?.resume();

          voicePlayer.current?.resume();
        } else cancelWork();
        setMessages((items) => {
          for (let i = items.length - 1; i >= 0; i--)
            if (items[i].who === "you" && items[i].text === text) {
              const next = [...items];
              next[i] = {
                ...next[i],
                note: "Ignored — that voice didn't match the owner.",
              };
              return next;
            }
          return items;
        });
        noteSpeaker("Ignored — that voice didn't match the owner.");
      });
    let epoch = current.current.epoch;
    setBusy(true);
    setResearching(!!instructionsUrl);
    setProblem("");
    setFailed(null);
    // Soft-stop first: the turn may still prove to be speaker echo, in
    // which case the preserved queue resumes instead of being destroyed.
    stopSpeech(true);
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
      if (speakerCheck?.settled === "stranger") {
        // Proven before transcription: skip the server call entirely and
        // resume any interrupted reply, like the echo verdict below.
        speech.current?.resume();

        voicePlayer.current?.resume();
        activeVoice.current = null;
        noteSpeaker("Ignored — that voice didn't match the owner.");
        return;
      }
      if (pause.current) await pause.current;
      if (controller.signal.aborted || token !== generation.current) return;
      epoch = current.current.epoch;
      const sampleFrames = withImage
        ? (async () => {
            let frame = await camera.sample();
            if (!frame) {
              await new Promise((resolve) => setTimeout(resolve, 80));
              frame = await camera.sample();
            }
            if (!frame) return null;
            return {
              frames: await encodeCameraFrames(camera.recent()),
              capturedAt: frame.at,
            };
          })()
        : null;
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
      if (voiceInput?.audio && !text.trim()) {
        // Transcribed nothing (a pop or fragment Meta heard no speech in):
        // resume any interrupted reply instead of answering silence.
        speech.current?.resume();

        voicePlayer.current?.resume();
        activeVoice.current = null;
        return;
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
          speech.current?.resume();

          voicePlayer.current?.resume();
          activeVoice.current = null;
          return;
        }
      }
      // Genuine turn (or typed send): drop any preserved speech for good —
      // unless a speaker check is still pending, in which case the drop
      // waits for the first reply token so a stranger verdict can still
      // resume the interrupted reply.
      if (speakerCheck && speakerCheck.settled === undefined)
        deferredSpeechCancel = true;
      else stopSpeech();
      let image: string | undefined,
        capturedAt: number | undefined,
        frames: VideoFrame[] | undefined;
      if (sampleFrames) {
        const sampled = await sampleFrames;
        if (sampled) {
          frames = sampled.frames;
          capturedAt = sampled.capturedAt;
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
      neuralReply.current = false;
      setVoiceNote("");
      delete document.body.dataset.voiceMode;
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
          voice: isNeuralVoiceEnabled() ? "neural" : "off",
          requestId: crypto.randomUUID(),
        },
        controller.signal,
        (delta) => {
          if (deferredSpeechCancel) {
            deferredSpeechCancel = false;
            stopSpeech();
          }
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
          if (aloud.current && !neuralReply.current) speech.current?.push(delta);
        },
        () => {
          const timing = activeVoice.current;
          if (timing && timing.modelFirstTokenMs === undefined)
            timing.modelFirstTokenMs = Date.now();
        },
        (mode) => {
          neuralReply.current = mode === "neural";
          document.body.dataset.voiceMode = mode;
          setVoiceNote(
            mode === "neural"
              ? "Neural voice on · waiting for audio"
              : "Device voice (neural unavailable)",
          );
        },
        (event) => {
          if (
            controller.signal.aborted ||
            token !== generation.current ||
            epoch !== current.current.epoch
          )
            return;
          if (event.type === "audio") {
            voicePlayer.current?.playAudio(event);
            const state = voicePlayer.current?.getState();
            setVoiceNote(
              state?.ctx !== "running"
                ? "Audio paused by browser · tap here to resume"
                : `Neural voice · sentence ${event.seq + 1}`,
            );
          } else {
            voicePlayer.current?.audioError(event.text);
            setVoiceNote(`Neural voice · device fallback (sentence ${event.seq + 1})`);
          }
        },
        () => {
          if (
            aloud.current &&
            !controller.signal.aborted &&
            token === generation.current
          )
            voicePlayer.current?.finish();
        },
        () => {
          replyDone.current = true;
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
      if (instructionsUrl) closeLink();
      if (aloud.current) {
        // Non-streamed completion with a pending check: drop preserved
        // speech before push()/finish() can pump it (empty replies).
        if (deferredSpeechCancel) {
          deferredSpeechCancel = false;
          stopSpeech();
        }
        if (!streamed && !neuralReply.current)
          speech.current?.push(result.message);
        if (!neuralReply.current) speech.current?.finish();
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
      if (deferredSpeechCancel && token === generation.current) stopSpeech();
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
  function openLaneForTurn() {
    if (!streamingMode.current) return;
    const flush = turns.current.started();
    if (flush) {
      voice.current?.closeStream();
      void send("", undefined, camera.active, { audio: flush });
    }
    setPartial("");
    if (voice.current) voice.current.open(current.current.epoch);
    else turns.current.streamFailed();
  }
  const mic = useMicrophone(
    (audio, stats) => {
      if (bargeGuard.current?.turnReady()) return;
      if (streamingMode.current) {
        const decision = turns.current.wavReady(audio);
        // Dropped turns send nothing and get no check; the rest verify.
        if (decision === "fallback") {
          startSpeakerCheck(audio, stats.voicedMs);
          void send("", undefined, camera.active, {
            audio,
            note: "Sent as a voice recording (live transcription unavailable).",
          });
        } else if (decision === "store")
          startSpeakerCheck(audio, stats.voicedMs);
        return;
      }
      startSpeakerCheck(audio, stats.voicedMs);
      void send("", undefined, camera.active, { audio });
    },
    onProblem,
    () => {
      if (bargeGuard.current?.turnStarted()) return;
      pendingVoice.current = {
        capturedStartMs: Date.now(),
        duringSpeech: speaking,
      };
      bargeAlive.current = true;
      if (!(lock.current || speaking)) {
        openLaneForTurn();
        return;
      }
      const timing = activeVoice.current;
      if (
        timing &&
        timing.playbackStartMs !== undefined &&
        timing.bargeDetectMs === undefined
      )
        timing.bargeDetectMs = Date.now();
      // Soft-stop: the burst may still prove to be speaker echo, so the
      // unheard queue is preserved until the transcript verdict.
      // A detector onset is only a candidate interruption. Keep receiving
      // reply audio until a completed voice turn actually supersedes it.
      // Otherwise a short noise burst can cancel Kokoro before its first
      // sentence is ready, leaving visible text with no playable audio.
      stopSpeech(true);
      // stopSpeech() stops local speech synchronously, so this mark lands
      // right after the playback stop it measures.
      const stopped = activeVoice.current;
      if (
        stopped &&
        stopped.bargeDetectMs !== undefined &&
        stopped.playbackStopMs === undefined
      )
        stopped.playbackStopMs = Date.now();
      // Only a turn still alive after confirmation opens the ASR lane.
      // Server invalidation waits for its completed transcript in send().
      if (bargeTimer.current) clearTimeout(bargeTimer.current);
      bargeTimer.current = setTimeout(() => {
        bargeTimer.current = null;
        if (!bargeAlive.current) return;
        // ASR can listen beside reply generation. Invalidating the server
        // here would cancel the response even if this turns out to be echo
        // or a dropped burst. send() supersedes it after a real final turn.
        openLaneForTurn();
      }, BARGE_CONFIRM_MS);
    },
    speaking,
    {
      samples: (pcm) => voice.current?.audio(pcm),
      turnEnd: () => {
        if (turns.current.shouldEnd()) voice.current?.end();
      },
    },
    {
      endSilenceMs: () =>
        isTurnComplete(partial)
          ? COMPLETE_END_SILENCE_MS
          : streamingMode.current
            ? 500
            : 850,
      shouldExtend: () => isTurnContinuation(partial),
      onMlStatus: (ready, reason) => {
        if (ready) {
          setMlVadNote("");
      setVoiceNote("");
          return;
        }
        const detail = String(reason ?? "unknown").slice(0, 90);
        console.warn(`[glint-voice] neural VAD unavailable: ${detail}`);
        setMlVadNote(
          `Neural voice detection unavailable (${detail}); using basic detection.`,
        );
      },
      onSpeechEnd: (turnSent) => {
        bargeAlive.current = false;
        // A dropped burst produced no audio and sends nothing, so it must
        // not kill the reply: resume where the soft-stop paused. Sent turns
        // resolve through the echo verdict in send() instead.
        if (!turnSent) {
          speech.current?.resume();
          voicePlayer.current?.resume();
        }
        if (bargeTimer.current) {
          clearTimeout(bargeTimer.current);
          bargeTimer.current = null;
        }
      },
    },
  );
  const cancelWork = useCallback((softSpeech = false) => {
    // A soft barge during the post-text audio drain must not abort the
    // stream: echo and dropped bursts resume it, and only a genuine new
    // turn (see send()) supersedes the drain.
    if (!(softSpeech && replyDone.current)) {
      generation.current++;
      request.current?.abort();
      request.current = null;
      lock.current = false;
      visualJob.current = false;
    }
    setObserving(false);
    setBusy(false);
    setResearching(false);
    stopSpeech(softSpeech);
    if (softSpeech) return;
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
    return pauseServer(clearVision);
  }
  function pauseServer(clearVision = false) {
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
    pendingVisualEvent.current = null;
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
      bargeAlive.current = false;
      if (bargeTimer.current) {
        clearTimeout(bargeTimer.current);
        bargeTimer.current = null;
      }
      releaseWakeLock();
      setMlVadNote("");
      speakerChecks.current.purge();
      noteSpeaker("");
      return;
    }
    holdWakeLock();
    if (!isStreamingVoiceEnabled()) return;
    streamingMode.current = true;
    const fallback = (audio: Blob) =>
      void sendRef.current("", undefined, cameraActive.current, {
        audio,
        note: "Sent as a voice recording (live transcription unavailable).",
      });
    const finishStreamed = (transcript: string) => {
      if (!turns.current.finalArrived()) return;
      setPartial("");
      voice.current?.closeStream();
      if (!transcript.trim()) {
        // No send runs for empty finals: discard this turn's check so it
        // can never judge a later turn.
        speakerChecks.current.claim();
        speech.current?.resume();

        voicePlayer.current?.resume();
        return;
      }
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
      onGap: () => {
        // A transcript after lost audio may omit words. Use the whole
        // locally recorded turn rather than answer a truncated question.
        failStream();
        voice.current?.closeStream();
      },
      onClosed: (info) => {
        const answered = failStream();
        if (!answered && info.reason === "allowance-exhausted")
          setProblem(
            "The 100-call session allowance is used. No more work was sent.",
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
  useEffect(
    () => () => {
      void speaker.current?.dispose();
    },
    [],
  );
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
    speech.current?.unlock();
    voicePlayer.current?.unlock();
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
    speech.current?.unlock();
    voicePlayer.current?.unlock();
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
        <div className="companion-controls">
          <button
            className="icon-button"
            aria-label={
              readAloud ? "Mute spoken replies" : "Enable spoken replies"
            }
            onClick={() => {
              if (!readAloud) {
                speech.current?.unlock();
                voicePlayer.current?.unlock();
              }
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
        {mic.enabled && mlVadNote && (
          <p className="companion-ml-note">{mlVadNote}</p>
        )}
        {mic.enabled && voiceNote && (
          <p
            className="companion-voice-note"
            onClick={() => {
              speech.current?.unlock();
              voicePlayer.current?.unlock();
            }}
          >
            {voiceNote}
          </p>
        )}
        {speakerNote && (
          <p className="companion-speaker-note">{speakerNote}</p>
        )}
        {!fullscreen && partial && <p className="companion-partial" aria-live="polite">{partial}</p>}
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
              <button
                className="button camera-flip"
                aria-label={camera.facingMode === "environment" ? "Switch to front camera" : "Switch to back camera"}
                disabled={camera.starting}
                onClick={() => {
                  void interrupt(false, true).then(() => camera.flip()).then(ok => {
                    if (ok) setFullscreen(true);
                  });
                }}
              ><SwitchCamera size={18} /> Flip camera</button>
              {fullscreen && (partial || messages.filter(m => m.who === "you").at(-1)?.text) && (
                <p className="camera-transcript" aria-live="polite">
                  You: {partial || messages.filter(m => m.who === "you").at(-1)?.text}
                </p>
              )}
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
          <div className="composer-actions">
            <button
              className={`button primary talk-button ${mic.enabled ? "recording" : ""}`}
              aria-label={mic.enabled ? "End voice chat" : "Talk to Glint"}
              aria-pressed={mic.enabled}
              disabled={mic.preparing || !online}
              onClick={() => {
                speech.current?.unlock();

                voicePlayer.current?.unlock();
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
            <button
              className="button camera-button"
              aria-label={
                camera.starting
                  ? "Opening camera…"
                  : camera.active
                    ? "Stop camera"
                    : "Open camera"
              }
              disabled={camera.starting}
              onClick={() => {
                if (camera.active) {
                  camera.stop();
                  void interrupt(false, true);
                } else {
                  // Unlock while the tap is still active, before camera
                  // permission/startup awaits lose mobile user activation.
                  speech.current?.unlock();
                  voicePlayer.current?.unlock();
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
              <span className="talk-label">
                {camera.starting
                  ? "Opening camera…"
                  : camera.active
                    ? "Stop camera"
                    : "Open camera"}
              </span>
            </button>
          </div>
        </div>
        <p className="companion-note">
          Voice listens until you end the chat. Glint replies aloud as the
          answer arrives.
        </p>
        <div className="voice-lock-row">
          {enrolling ? (
            <p role="status">
              Recording sample {enrolling.sample} of {enrolling.total}…{" "}
              {ENROLL_PROMPTS[enrolling.sample - 1]}{" "}
              <button
                className="text-button"
                // The progress clears when the flow actually exits (below),
                // so a re-tap can never interleave two enrollments.
                onClick={() => {
                  enrollCancel.current = true;
                }}
              >
                Cancel
              </button>
            </p>
          ) : voiceprint ? (
            <p>
              Voice lock: On · answers only you{" "}
              <button
                className="text-button"
                onClick={() => void enrollVoice()}
              >
                Re-teach
              </button>{" "}
              <button
                className="text-button"
                onClick={() => {
                  clearVoiceprint();
                  setVoiceprint(null);
                }}
              >
                Turn off
              </button>
            </p>
          ) : (
            <p>
              Voice lock: Off ·{" "}
              <button
                className="text-button"
                onClick={() => void enrollVoice()}
              >
                Teach Glint your voice
              </button>
            </p>
          )}
        </div>
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
