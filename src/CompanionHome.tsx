import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { LookPreview } from "./LookPreview";
import { wantsLookPreview, lookFollowup, type LookPreviewResult } from "../shared/look-preview";
import {
  ArrowUp,
  Camera,
  CameraOff,
  SwitchCamera,
  Captions,
  MessageCircle, Settings2, ChevronLeft, Sun, Moon, Monitor, MicOff, Sparkles, Play, Check,
  Link,
  LoaderCircle,
  Maximize,
  Mic,
  Square,
  Volume2,
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
import { Spark } from "./Art.tsx";
import { loadAppearance, applyAppearance, type Appearance } from "./appearance.ts";
import { trackingIntent, clarifyTrackingObject, cancelsTracking } from "../shared/tracking-intent.ts";
import { VoiceDiagnostics, type VoiceDiagnostic } from "../shared/voice-diagnostics.ts";
import {
  loadSubtitlesEnabled,
  saveSubtitlesEnabled,
} from "./subtitles.ts";
import { logTiming, type VoiceTurnTiming } from "../shared/timing.ts";
import type { ObjectMotion } from "../shared/object-motion.ts";
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
  motion?: ObjectMotion;
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
  openLink,
}: {
  view: View;
  online: boolean;
  model: string;
  api: Api;
  connect: () => void;
  linkOpen: boolean;
  closeLink: () => void;
  openLink: () => void;
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
  const [trackConcept,setTrackConcept]=useState("");
  const [tracking,setTracking]=useState<"recording"|"analyzing"|null>(null);
  const trackingStart = useRef(false);
  const [objectMotion,setObjectMotion]=useState<ObjectMotion|null>(null);
  const [trackProblem,setTrackProblem]=useState("");
  const [trackingRequested, setTrackingRequested] = useState(false);
  const [trackingAllowed, setTrackingAllowed] = useState(true);
  const [lastTrackingClip, setLastTrackingClip] = useState<string | null>(null);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [lookRequest,setLookRequest]=useState("");
  const [lookPrompt,setLookPrompt]=useState("");
  const [lookAccepted,setLookAccepted]=useState(false);
  const [lookVersion,setLookVersion]=useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [started, setStarted] = useState(() => {
    try { return sessionStorage.getItem("glint-started") === "1"; } catch { return false; }
  });
  const [appearance, setAppearance] = useState<Appearance>(loadAppearance);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const conversationDialog = useRef<HTMLDialogElement>(null);
  const clipDialog = useRef<HTMLDialogElement>(null);
  const trackingAllowedRef = useRef(trackingAllowed);
  trackingAllowedRef.current = trackingAllowed;
  const trackingPromptRef = useRef({ requested: trackingRequested, concept: trackConcept });
  trackingPromptRef.current = { requested: trackingRequested, concept: trackConcept };
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyAppearance(appearance, media.matches);
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance]);
  useEffect(() => {
    if (settingsOpen) settingsDialog.current?.showModal();
    else settingsDialog.current?.close();
  }, [settingsOpen]);
  useEffect(() => {
    if (conversationOpen) conversationDialog.current?.showModal();
    else conversationDialog.current?.close();
  }, [conversationOpen]);
  const [mlVadNote, setMlVadNote] = useState("");
  const [voiceNote, setVoiceNote] = useState("");

  const [diagnosticsOn, setDiagnosticsOn] = useState(false);
  const [diagnosticEvents, setDiagnosticEvents] = useState<VoiceDiagnostic[]>([]);
  const [diagnosticUpload, setDiagnosticUpload] = useState("");
  const diagnostics = useRef(new VoiceDiagnostics());
  const diagnosticTurn = useRef(0), replyDiagnosticTurn = useRef(0);
  const diagnosticEnds = useRef(new Map<number, number>());
  const diagnosticPartial = useRef(false);
  const latestApi = useRef(api);
  latestApi.current = api;
  const recordVoice = useCallback((stage: VoiceDiagnostic["stage"],
    details: { reason?: VoiceDiagnostic["reason"]; durationMs?: number } = {},
    turn = diagnosticTurn.current) => {
    if (diagnostics.current.record({ stage, turn, ...details }))
      setDiagnosticEvents(diagnostics.current.snapshot());
  }, []);
  const recordPlayback = (stage: "audio-scheduled" | "device-playback-start" | "playback-blocked") => {
    const turn = replyDiagnosticTurn.current;
    const end = diagnosticEnds.current.get(turn);
    recordVoice(stage, end === undefined ? {} : { durationMs: Math.round(performance.now() - end) }, turn);
  };
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
  const bargeVoicedMs = useRef(0);
  const bargeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markSpoken = (phrase: string) => {
    bargeGuard.current?.markSpoke();
    const timing = activeVoice.current;
    if (timing && timing.playbackStartMs === undefined)
      timing.playbackStartMs = Date.now();
    setSubtitle(phrase);
  };
  if (!speech.current)
    speech.current = new SpeechQueue(setSpeaking, markSpoken, () => recordPlayback("device-playback-start"));
  if (!voicePlayer.current)
    voicePlayer.current = new VoicePlayer(setSpeaking, markSpoken, recordPlayback);
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
    skipLookRouting = false,
  ) {
    setEnded(false);
    if (voiceInput) recordVoice("turn-accepted", { reason: "lock-off" });
    if (lock.current) {
      if (visualJob.current || voiceInput) {
        const pendingPause = interrupt(false), expectedGeneration = generation.current;
        await pendingPause;
        if (expectedGeneration !== generation.current) return;
      }
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
          })().catch(() => null)
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
        recordVoice("asr-final");
        if (activeVoice.current)
          activeVoice.current.asrFinalMs = Date.now();
      }
      if (voiceInput?.audio && !text.trim()) {
        recordVoice("turn-rejected", { reason: "empty" });
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
          recordVoice("turn-rejected", { reason: "echo" });
          // Speaker echo, not the user: answer nothing and keep it out of
          // the timing baseline. Fail-open — a real turn is never dropped
          // for a missing speech flag.
          speech.current?.resume();

          voicePlayer.current?.resume();
          activeVoice.current = null;
          return;
        }
      }
      if(!instructionsUrl && /\b(?:just ideas|text.only)\b/i.test(text)){
        skipLookRouting=true;setLookRequest("");setLookAccepted(false);
      }
      const followup=!instructionsUrl&&!skipLookRouting&&lookRequest?lookFollowup(text,lookPrompt||lookRequest):null;
      if(followup){
        setQuestion("");
        let reply="";
        if(followup.kind==="dismiss"){
          setLookRequest("");setLookAccepted(false);
          reply="Photo preview closed. No new image generation was requested.";
        }else if(followup.kind==="clarify"){
          reply="Do you mean no photo preview, or do you want me to create the look? Your chosen look is still here.";
        }else if(followup.kind==="photo"){
          setLookAccepted(true);setLookPrompt(followup.request);
          reply="Yes, I can create that look. Choose or take a photo of yourself in the look preview, then press Generate preview. You don't need a photo of the fairy look or any makeup supplies.";
        }else{
          setLookPrompt(followup.request);
          reply=lookAccepted?"I've updated your chosen look. Choose a photo if needed, then press Generate preview when you're ready.":"Got it, I've saved that look preference. I can show it on a photo of you. Say create the image, or choose Yes, choose a photo in the preview.";
        }
        setMessages(items=>[...items,{who:"you",text},{who:"glint",text:reply}].slice(-20) as Message[]);
        stopSpeech();if(aloud.current){speech.current?.push(reply);speech.current?.finish();}
        return;
      }
      if(!instructionsUrl && !skipLookRouting && wantsLookPreview(text)){
        const direct=lookFollowup(text,text)?.kind==="photo";
        setLookRequest(text.slice(0,1500));setLookPrompt(text.slice(0,1500));setLookAccepted(direct);setLookVersion(version=>version+1);setQuestion("");
        const offer=direct?"Choose or take a photo of yourself in the look preview, describe the look, then press Generate preview.":"I can create a look preview on a photo you choose. Pick a style such as celestial witch, vampire, or fantasy makeup, then choose whether you want a photo preview.";
        setMessages(items=>[...items,{who:"you",text},{who:"glint",text:offer}].slice(-20) as Message[]);
        stopSpeech();if(aloud.current){speech.current?.push(offer);speech.current?.finish();}
        return;
      }
      const intent = !instructionsUrl ? trackingIntent(text) : null;
      if (!instructionsUrl && trackingPromptRef.current.requested && cancelsTracking(text)) {
        setQuestion(""); setTrackingRequested(false); setTrackConcept(""); setTrackProblem("");
        stopSpeech();
        setMessages(items => [...items, {who:"you",text}, {who:"glint",text:"Movement check canceled. What would you like to do next?"}].slice(-20) as Message[]);
        return;
      }
      const clarifying = trackingPromptRef.current.requested && !trackingPromptRef.current.concept
        ? clarifyTrackingObject(text) : null;
      if (intent || clarifying) {
        setQuestion("");
        const concept = intent?.concept ?? clarifying ?? "";
        const prior = objectMotion;
        const fresh = prior && concept === prior.concept && prior.epoch === current.current.epoch &&
          Date.now() - prior.to >= 0 && Date.now() - prior.to < 15000;
        const response = fresh
          ? `Recorded ${concept} movement: ${prior.direction.replaceAll("-", " ")}, relative to the camera. ${prior.reason}`
          : concept
            ? `I need a new clip to check the ${concept}. Keep the camera still, then move it when recording starts.`
            : "Which object should I check? For example, the mouse, cable, bottle or cup.";
        setTrackConcept(concept);
        setTrackingRequested(!fresh);
        setTrackProblem("");
        stopSpeech();
        setMessages(items => [...items, { who: "you", text }, { who: "glint", text: response }].slice(-20) as Message[]);
        if (aloud.current) { speech.current?.push(response); speech.current?.finish(); }
        return;
      }
      stopSpeech();
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
      const replyTurn = voiceInput ? diagnosticTurn.current : 0;
      replyDiagnosticTurn.current = replyTurn;
      if (voiceInput) recordVoice("reply-dispatched", {}, replyTurn);
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
          lookPreview:lookRequest&&!skipLookRouting?{request:lookPrompt,stage:lookAccepted?"photo-controls":"offered"}:undefined,
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
          if (aloud.current && !neuralReply.current) speech.current?.push(delta);
        },
        () => {
          if (voiceInput) recordVoice("first-text", {}, replyTurn);
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
          if (!aloud.current) return;
          if (event.type === "audio") {
            if (voiceInput) recordVoice("audio-received", {}, replyTurn);
            voicePlayer.current?.playAudio(event);
            const state = voicePlayer.current?.getState();
            setVoiceNote(
              state?.ctx !== "running"
                ? "Audio paused by browser · tap here to resume"
                : `Neural voice · sentence ${event.seq + 1}`,
            );
          } else {
            if (voiceInput) recordVoice("device-fallback", {}, replyTurn);
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
      if (voiceInput && token === generation.current && activeVoice.current) {
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
  async function generateLook(photo:string,prompt:string):Promise<LookPreviewResult>{
    if(!current.current.key.connected){connect();throw Error("Connect your model key before generating a preview.");}
    const pending=interrupt(false),expected=generation.current;
    await pending;
    if(expected!==generation.current)throw Error("Preview canceled.");
    const controller=new AbortController(),token=generation.current;
    request.current=controller;lock.current=true;setBusy(true);
    try{
      const result=await api("look-preview",{photo,prompt,consent:true,epoch:current.current.epoch,requestId:crypto.randomUUID()},"POST",controller.signal) as LookPreviewResult;
      if(controller.signal.aborted||token!==generation.current||result.epoch!==current.current.epoch)throw Error("Preview canceled.");
      return result;
    }finally{if(request.current===controller){request.current=null;lock.current=false;setBusy(false);}}
  }
  async function trackObject() {
    if(!current.current.key.connected){connect();return;}
    if(!trackingAllowedRef.current || !camera.active || tracking || trackingStart.current)return;
    const concept=trackConcept.trim();
    if(!concept){setTrackProblem("Name one object to track, such as computer mouse.");return;}
    trackingStart.current=true;
    const pausing=interrupt(false), token=generation.current;
    await pausing;
    if(token!==generation.current || !cameraActive.current || !trackingAllowedRef.current){trackingStart.current=false;return;}
    const controller=new AbortController(),epoch=current.current.epoch;
    request.current=controller;lock.current=true;visualJob.current=true;
    setObjectMotion(null);setLastTrackingClip(null);setTrackProblem("");setProblem("");setTracking("recording");
    try {
      const clip=await camera.recordClip(controller.signal);
      if(controller.signal.aborted || token!==generation.current)return;
      setTracking("analyzing");
      const result=await api("track",{...clip,concept,epoch,requestId:crypto.randomUUID()},"POST",controller.signal) as ObjectMotion;
      if(controller.signal.aborted || token!==generation.current || result.epoch!==current.current.epoch)return;
      setObjectMotion(result);
      setLastTrackingClip(clip.clip);
      setTrackingRequested(false);
      const resultText = result.direction === "uncertain"
        ? `I could not confirm the ${concept}'s movement. ${result.reason}`
        : `Recorded ${concept}: ${result.direction.replaceAll("-", " ")}, relative to the camera. ${result.reason}`;
      setMessages(items => [...items, { who: "glint", text: resultText, motion: result }].slice(-20) as Message[]);
      if (aloud.current) { speech.current?.push(resultText); speech.current?.finish(); }
      nextObservation.current=Date.now()+6000;
    } catch(error) {
      if(!controller.signal.aborted && token===generation.current)
        setTrackProblem(error instanceof Error?error.message:"Object tracking failed.");
    } finally {
      trackingStart.current=false;
      setTracking(null);
      if(request.current===controller){request.current=null;lock.current=false;visualJob.current=false;}
    }
  }
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
      diagnosticEnds.current.set(diagnosticTurn.current, performance.now());
      if (diagnosticEnds.current.size > 120)
        diagnosticEnds.current.delete(diagnosticEnds.current.keys().next().value!);
      recordVoice("speech-end", { durationMs: Math.round(stats.voicedMs) });
      if (bargeGuard.current?.turnReady()) return;
      // Frame rounding can make a 180ms pop pass the detector's 200ms
      // minimum. It must not supersede a reply that is still in flight.
      if (stats.voicedMs < 300 && (lock.current || speaking || pendingVoice.current?.duringSpeech)) {
        recordVoice("detector-drop", {reason:"short"});
        turns.current.reset();
        voice.current?.closeStream();
        pendingVoice.current = null;
        speech.current?.resume();
        voicePlayer.current?.resume();
        return;
      }
      if (streamingMode.current) {
        const decision = turns.current.wavReady(audio);
        // Dropped turns send nothing and get no check; the rest verify.
        if (decision === "fallback") {
          void send("", undefined, camera.active, {
            audio,
            note: "Sent as a voice recording (live transcription unavailable).",
          });
        }
        return;
      }
      void send("", undefined, camera.active, { audio });
    },
    onProblem,
    () => {
      if (bargeGuard.current?.turnStarted()) return;
      diagnosticTurn.current++;
      diagnosticPartial.current = false;
      recordVoice("speech-start");
      pendingVoice.current = {
        capturedStartMs: Date.now(),
        duringSpeech: speaking,
      };
      bargeAlive.current = true;
      bargeVoicedMs.current = 0;
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
      // Only a turn still alive after confirmation opens the ASR lane.
      // Server invalidation waits for its completed transcript in send().
      if (bargeTimer.current) clearTimeout(bargeTimer.current);
      bargeTimer.current = setTimeout(() => {
        bargeTimer.current = null;
        if (!bargeAlive.current) return;
        // Brief noise must survive confirmation before pausing playback.
        if (bargeVoicedMs.current >= 300) {
          stopSpeech(true);
          recordVoice("interrupted");
          const timing = activeVoice.current;
          if (timing?.bargeDetectMs !== undefined && timing.playbackStopMs === undefined)
            timing.playbackStopMs = Date.now();
        }
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
          : 1100,
      shouldExtend: () => isTurnContinuation(partial),
      onSpeechProgress: (voicedMs) => { bargeVoicedMs.current = voicedMs; },
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
          recordVoice("detector-drop", { reason: "short" });
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
    setTracking(null);
    if (!softSpeech && activeVoice.current) {
      logTiming(activeVoice.current);
      activeVoice.current = null;
    }
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
      recordVoice("asr-final");
      setPartial("");
      voice.current?.closeStream();
      if (!transcript.trim()) {
        recordVoice("turn-rejected", { reason: "empty" });
        // No send runs for empty finals: discard this turn's check so it
        // can never judge a later turn.
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
        if (!diagnosticPartial.current) {
          diagnosticPartial.current = true;
          recordVoice("asr-partial");
        }
        const pending = pendingVoice.current;
        if (pending && pending.asrFirstPartialMs === undefined)
          pending.asrFirstPartialMs = Date.now();
        setPartial(text);
      },
      onTurn: (_id, transcript) => finishStreamed(transcript),
      onFinal: (transcript) => finishStreamed(transcript),
      onGap: () => {
        recordVoice("transport-gap");
        // A transcript after lost audio may omit words. Use the whole
        // locally recorded turn rather than answer a truncated question.
        failStream();
        voice.current?.closeStream();
      },
      onClosed: (info) => {
        recordVoice("transport-closed");
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
  useEffect(() => {
    if (!diagnosticsOn) return;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      const events = diagnostics.current.takeBatch();
      if (!events.length) return;
      inFlight = true;
      void latestApi.current("voice-diagnostics", { events }, "POST")
        .then(() => setDiagnosticUpload("Shared with this test server."))
        .catch(() => setDiagnosticUpload("Could not share this batch. Local download is still available."))
        .finally(() => { inFlight = false; });
    }, 5000);
    return () => clearInterval(timer);
  }, [diagnosticsOn]);
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
  const enterFullscreen = () => {
    speech.current?.unlock();
    voicePlayer.current?.unlock();
    setFullscreen(true);

  };
  const openCamera = async () => {
    speech.current?.unlock(); voicePlayer.current?.unlock();
    setEnded(false); setProblem("");
    await camera.start();
  };
  const toggleMic = () => {
    if (mic.enabled) { mic.cancel(); return; }
    speech.current?.unlock(); voicePlayer.current?.unlock();
    if (!current.current.key.connected) { connect(); return; }
    setEnded(false);
    void mic.start();
  };
  const endSession = () => {
    camera.stop(); mic.cancel(); stopSpeech();
    setTrackingRequested(false); setLastTrackingClip(null); setObjectMotion(null);
    setLookRequest("");setLookAccepted(false);
    setConversationOpen(false); setSettingsOpen(false); setFullscreen(false);
    setEnded(true);
    void interrupt(true, true);
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
  const status = !online ? "Connection lost" : tracking === "recording" ? "Recording movement" : tracking === "analyzing" ? "Checking movement" : speaking ? "Speaking" : busy ? "Thinking" : mic.preparing ? "Preparing microphone" : mic.enabled ? "Listening" : "Mic off";
  const latestAnswer = messages.filter(message => message.who === "glint").at(-1)?.text;
  const controls = <div className="glint-controls">
    <button className="glint-control" aria-label={camera.active ? "Stop camera" : "Open camera"} disabled={camera.starting || !online} onClick={() => {
      if (camera.active) { camera.stop(); setObjectMotion(null); setLastTrackingClip(null); void interrupt(false, true); }
      else void openCamera();
    }}>{camera.active ? <CameraOff size={21}/> : <Camera size={21}/>}<span>{camera.starting ? "Opening…" : camera.active ? "Camera off" : "Camera"}</span></button>
    <button className={`glint-mic ${mic.enabled ? "is-listening" : ""}`} aria-label={mic.preparing ? "Preparing microphone" : mic.enabled ? "End voice chat" : "Talk to Glint"} aria-pressed={mic.enabled} disabled={mic.preparing || !online} onClick={toggleMic}>
      {mic.enabled ? <Mic size={29}/> : <MicOff size={29}/>}<span>{mic.preparing ? "Preparing" : mic.enabled ? "End voice chat" : "Talk"}</span>
    </button>
    <button className="glint-control" aria-label="Open conversation" onClick={() => setConversationOpen(true)}><MessageCircle size={21}/><span>Conversation</span>{messages.length > 0 && <i className="glint-unread"/>}</button>
  </div>;
  const composer = <form className="companion-input glint-composer" onSubmit={submit}>
    <label className="sr-only" htmlFor="companion-question">Message Glint</label>
    <input id="companion-question" value={question} maxLength={2000} placeholder="Ask anything about your task…" onChange={event => setQuestion(event.target.value)} onFocus={() => { if (speaking) stopSpeech(); }}/>
    <button className="glint-send" aria-label="Send message" disabled={!question.trim() || busy || !!tracking || !online}><ArrowUp size={22}/></button>
  </form>;
  return (
    <section className={`companion-home glint-ui ${camera.active ? "has-camera" : ""}`} aria-label="Talk with Glint">
      <div className="glint-main-surface" inert={conversationOpen || settingsOpen} aria-hidden={conversationOpen || settingsOpen ? true : undefined}>
      <header className="glint-header">
        <button className="glint-brand" aria-label="Glint companion home" onClick={() => { setConversationOpen(false); setSettingsOpen(false); if (camera.active) { camera.stop(); void interrupt(false, true); } }}><Spark small/><span>Glint</span></button>
        <div className="glint-header-actions">
          {started && !ended && <button className="glint-end" onClick={endSession}>End session</button>}
          <button className="glint-round" aria-label="Open settings" onClick={() => setSettingsOpen(true)}><Settings2 size={21}/></button>
        </div>
      </header>
      {ended ? <div className="glint-ended">
        <Spark state="ready"/><p className="glint-eyebrow">UNTIL NEXT TIME</p><h1>Session ended.</h1><p>Your camera and microphone are off.</p>
        <button className="glint-primary" onClick={() => { setEnded(false); setStarted(true); }}>Start again <ArrowUp className="glint-next" size={18}/></button>
        {messages.length > 0 && <button className="glint-text" onClick={() => setConversationOpen(true)}>View conversation</button>}
      </div> : <>
        <div className="glint-workspace">
          <div className="glint-presence">
            <div className={`companion-camera glint-camera ${camera.active || camera.starting ? "is-active" : ""} ${fullscreen ? "is-fullscreen" : ""}`}>
              <video ref={camera.video} autoPlay muted playsInline aria-label="Your live camera preview"/>
              {camera.active && <>
                <div className="glint-camera-status"><i/> Camera on · {mic.enabled ? "Mic on" : "Mic off"}</div>
                <div className="glint-camera-actions">
                  <button className="glint-round" aria-label={camera.facingMode === "environment" ? "Switch to front camera" : "Switch to back camera"} onClick={() => { setObjectMotion(null); setLastTrackingClip(null); void interrupt(false, true).then(() => camera.flip()); }}><SwitchCamera size={20}/></button>
                  <button className="glint-round" aria-label={fullscreen ? "Exit full screen camera" : "View camera full screen"} onClick={() => fullscreen ? setFullscreen(false) : enterFullscreen()}>{fullscreen ? <X size={20}/> : <Maximize size={20}/>}</button>
                </div>
                {fullscreen && <>
                  {(partial || messages.filter(message => message.who === "you").at(-1)?.text) && <p className="camera-transcript">You: {partial || messages.filter(message => message.who === "you").at(-1)?.text}</p>}
                  {subsOn && subtitle && <p className="companion-subtitles">{subtitle}</p>}
                  <div className="glint-fullscreen-controls">{controls}</div>
                </>}
              </>}
            </div>
            {!camera.active && !camera.starting && <div className={`glint-star-scene ${speaking ? "is-speaking" : ""}`}>
              <div className="glint-star-orbit"/><Spark state={speaking ? "speaking" : busy ? "thinking" : mic.enabled ? "listening" : "ready"}/>
              <span className="glint-sparkle sparkle-one">✦</span><span className="glint-sparkle sparkle-two">✧</span>
            </div>}
            <div className="glint-guidance">
              {started ? <>
                <p className={`glint-status ${mic.enabled || speaking || busy ? "is-active" : ""}`} role="status"><i/>{status}</p>
                <h1>{camera.active ? !conversationOpen && latestAnswer ? latestAnswer.slice(0, 180) + (latestAnswer.length > 180 ? "…" : "") : "Show me what you’re working on." : "What can I help you with?"}</h1>
                <p className="glint-supporting">{camera.active ? visionPaused ? "Camera analysis paused. Reopen your camera to resume." : observing ? "Checking your recent camera view…" : awareness?.activity ? awareness.activity.slice(0, 120) : "Ask a question about what you see." : mic.enabled ? "Go ahead. I’m listening." : "Talk, type, or show me through your camera."}</p>
              </> : <><p className="glint-eyebrow">A LITTLE SPARK. A CLEARER NEXT STEP.</p><h1>Show me. Tell me.<br/>Let’s do it.</h1><p className="glint-supporting">A camera-and-voice companion for the things in front of you.</p>
                <button className="glint-primary" onClick={() => { setStarted(true); try { sessionStorage.setItem("glint-started", "1"); } catch { /* optional */ } }}>Start Glint <ArrowUp className="glint-next" size={19}/></button>
                <small className="glint-privacy">Your camera and mic start only when you choose.</small>
              </>}
              {partial && <p className="glint-live-transcript" aria-live="polite">{partial}</p>}
              {subsOn && speaking && subtitle && !fullscreen && !conversationOpen && <p className="glint-live-transcript">{subtitle}</p>}
              {(busy || speaking) && <button className="glint-interrupt" onClick={() => void interrupt(false)}><Square size={13}/> Interrupt</button>}
              {mic.enabled && voiceNote && <button className="glint-text glint-audio-note" onClick={() => { speech.current?.unlock(); voicePlayer.current?.unlock(); }}>{voiceNote}</button>}
              {lookRequest&&!conversationOpen&&<button className="glint-text" onClick={()=>setConversationOpen(true)}>Open your look preview</button>}
              {problem && !conversationOpen && <div className="notice error" role="alert"><span>{problem}</span>{failed && <button className="glint-text" disabled={busy || !online} onClick={() => void send(failed.text, failed.url, failed.withImage && camera.active)}>Retry</button>}<button className="glint-round" aria-label="Dismiss conversation message" onClick={() => setProblem("")}><X size={17}/></button></div>}
            </div>
          </div>
          {started && !fullscreen && <div className="glint-session-dock">{controls}</div>}
        </div>
        <footer className="glint-attribution"><Sparkles size={13}/> Built with Meta models <span>See · Understand · Guide</span></footer>
      </>}
      </div>
      <dialog ref={conversationDialog} className="glint-sheet glint-conversation" aria-label="Conversation" onCancel={() => setConversationOpen(false)}>
        <div className="glint-sheet-handle"/>
        <header className="glint-sheet-header"><div><p className="glint-eyebrow">YOUR CURRENT SESSION</p><h2><MessageCircle size={21}/> Conversation</h2></div><button className="glint-round" aria-label="Close conversation" onClick={() => setConversationOpen(false)}><X size={21}/></button></header>
        <div className="companion-transcript glint-messages" ref={scroll} role="log" aria-label="Conversation with Glint" aria-live="polite">
          {!messages.length && <div className="glint-chat-empty"><Spark small/><h3>What’s in front of you?</h3><p>Ask a question, show your workspace, or share a public instructions link in settings.</p></div>}
          {messages.map((message, index) => <article key={index} className={`companion-message from-${message.who}`}>
            <span>{message.who === "you" ? "You" : <><Sparkles size={13}/> Glint</>}</span><p>{message.text}</p>
            {message.streaming && <small>Replying…</small>}{message.interrupted && <small>Reply interrupted</small>}{message.note && <small>{message.note}</small>}
            {message.motion && <div className="glint-evidence"><span><Check size={15}/> Recorded clip · SAM 3.1</span><strong>{message.motion.direction.replaceAll("-", " ")}</strong><small>Relative to the camera · not continuous tracking</small>
              <div>{lastTrackingClip && message.motion === objectMotion && <button className="glint-text" onClick={() => clipDialog.current?.showModal()}><Play size={15}/> View clip</button>}
              {!ended && <button className="glint-text" onClick={() => { setTrackConcept(message.motion!.concept); setTrackingRequested(true); }}>Check again</button>}</div>
            </div>}
            {!!message.sources?.length && <ul className="agent-sources">{message.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>}
          </article>)}
          {trackingRequested && trackConcept && !ended && <div className="glint-tracking-card" role="region" aria-label="Movement check">
            <p className="glint-eyebrow">CHECK THE {trackConcept.toUpperCase()}</p><h3>{tracking === "recording" ? "Move it now · recording 2s" : tracking === "analyzing" ? "Analyzing the recorded movement…" : "Ready when you are."}</h3>
            <p>{!trackingAllowed ? "Object analysis is off. Enable it to check this movement." : camera.active ? "Hold the camera still. Move the object after recording starts." : "Open your camera first. Recording starts only when you’re ready."}</p>
            <small>SAM 3.1 · experimental · minimum 50 frames billed per clip</small>
            {trackProblem && <p role="alert">{trackProblem}</p>}
            {tracking ? <><LoaderCircle className="spin" size={20}/><button className="glint-text" onClick={() => void interrupt(false)}>Cancel check</button></> : <div className="glint-card-actions">
              <button className="glint-primary" disabled={!online} onClick={() => { if (!trackingAllowed) setTrackingAllowed(true); else if (!camera.active) void openCamera(); else void trackObject(); }}>{!trackingAllowed ? "Enable object analysis" : !camera.active ? "Open camera" : trackProblem ? "Retry movement check" : "Ready — check movement"}</button>
              <button className="glint-text" onClick={() => { setTrackingRequested(false); setTrackProblem(""); }}>Not now</button>
            </div>}
          </div>}
          {lookRequest&&!ended&&<LookPreview key={lookVersion} request={lookPrompt} accepted={lookAccepted} onPromptChange={setLookPrompt} onAccept={()=>setLookAccepted(true)} onDismiss={()=>{setLookRequest("");setLookAccepted(false);}} onIdeas={()=>{const question=lookPrompt||lookRequest;setLookRequest("");setLookAccepted(false);void send("Give me text-only ideas; do not generate images. "+question,undefined,false,undefined,true);}} generate={generateLook} cancel={()=>void interrupt(false)}/>}
          {busy && <p className="glint-wait"><LoaderCircle className="spin" size={17}/>{researching ? "Reading your instructions…" : "Thinking…"}</p>}
        </div>
        {problem && <div className="notice error" role="alert"><span>{problem}</span>{failed && <button className="glint-text" disabled={busy || !online} onClick={() => void send(failed.text, failed.url, failed.withImage && camera.active)}>Retry</button>}</div>}
        {!ended && <div className="message-composer">{composer}<div className="glint-chat-actions"><button className="glint-text" aria-label={mic.enabled ? "End voice chat" : "Talk to Glint"} onClick={toggleMic}>{mic.enabled ? <Mic size={17}/> : <MicOff size={17}/>} {mic.enabled ? "End voice chat" : "Talk to Glint"}</button><button className="glint-text" onClick={() => { setConversationOpen(false); if (!camera.active) void openCamera(); }}>{camera.active ? "Back to camera" : "Open camera"}</button>{speaking && <button className="glint-text" onClick={() => void interrupt(false)}>Interrupt</button>}</div></div>}
      </dialog>
      <dialog ref={settingsDialog} className="glint-sheet glint-settings" aria-label="Settings" onCancel={() => setSettingsOpen(false)}>
        <header className="glint-sheet-header"><h2><Settings2 size={22}/> Settings</h2><button className="glint-round" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={21}/></button></header>
        <div className="glint-settings-body">
          <p className="glint-eyebrow">MAKE IT YOURS</p><h3>Appearance</h3>
          <div className="glint-theme-switch" role="group" aria-label="Appearance">{([['system', Monitor], ['light', Sun], ['dark', Moon]] as const).map(([value, Icon]) => <button key={value} aria-pressed={appearance === value} onClick={() => setAppearance(value)}><Icon size={20}/>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
          <label className="glint-setting-row"><span><Volume2 size={20}/><span>Spoken replies<small>Hear Glint’s answers</small></span></span><input type="checkbox" checked={readAloud} onChange={event => { if (event.target.checked) { speech.current?.unlock(); voicePlayer.current?.unlock(); } aloud.current = event.target.checked; setReadAloud(event.target.checked); stopSpeech(); }}/></label>
          <label className="glint-setting-row"><span><Captions size={20}/><span>Captions<small>Show spoken replies on screen</small></span></span><input type="checkbox" checked={subsOn} onChange={event => { setSubsOn(event.target.checked); saveSubtitlesEnabled(event.target.checked); }}/></label>
          <div className="glint-setting-row"><span><MessageCircle size={20}/><span>Speech language<small>Automatic · English and Telugu</small></span></span></div>
          <label className="glint-setting-row"><span><Camera size={20}/><span>Allow object analysis<small>Only when you ask and start a check</small></span></span><input type="checkbox" checked={trackingAllowed} onChange={event => { setTrackingAllowed(event.target.checked); if (tracking && !event.target.checked) void interrupt(false); }}/></label>
          <p className="glint-setting-note">Camera on: recent images are checked automatically to support your questions. Object movement uses a separate, explicit short-clip check.</p>
          <h3>Your connection</h3>
          <button className="glint-setting-link" onClick={() => { setSettingsOpen(false); settingsDialog.current?.close(); connect(); }}><span>{view.key.connected ? "Model connected" : "Connect model"}<small>Manage your temporary API key</small></span><ChevronLeft className="glint-next" size={18}/></button>
          <p className="glint-setting-note">{view.calls} of {view.limit} session calls used. Camera checks also use this allowance.</p>
          <button className="glint-setting-link" onClick={() => { setSettingsOpen(false); settingsDialog.current?.close(); openLink(); }}><span>Add instructions link<small>Use a public product page or manual</small></span><Link size={18}/></button>
          <details className="glint-advanced"><summary>About the models</summary><p>Muse Voice Transcribe turns speech into text. Muse Spark answers questions using your conversation and recent camera frames. SAM 3.1 analyzes requested recorded movement. Muse Image creates photo previews only after you choose a photo and press Generate. Local Kokoro generates speech with device-voice fallback.</p></details>
          <details className="voice-diagnostics glint-advanced"><summary>Voice test diagnostics</summary><p>Optional event names and timings only. No audio, transcript, images, voiceprints or keys. Up to 120 events remain in this page; shared events appear in server logs.</p>
            <label className="glint-setting-row"><span>Record and share voice diagnostics</span><input type="checkbox" checked={diagnosticsOn} onChange={event => { if (event.target.checked) { diagnostics.current.start(); setDiagnosticEvents([]); } else diagnostics.current.stop(); setDiagnosticUpload(""); setDiagnosticsOn(event.target.checked); }}/></label>
            {diagnosticUpload && <p role="status">{diagnosticUpload}</p>}
            {diagnosticEvents.length > 0 && <><button className="glint-text" onClick={() => { const blob = new Blob([JSON.stringify({version:1, events:diagnostics.current.snapshot()}, null, 2)], {type:"application/json"}); const url = URL.createObjectURL(blob), anchor=document.createElement("a"); anchor.href=url; anchor.download="glint-voice-diagnostics.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download voice diagnostics</button><ol>{diagnosticEvents.slice(-8).map((event, index) => <li key={index}>Turn {event.turn}: {event.stage.replaceAll("-", " ")}{event.reason ? ` (${event.reason})` : ""}</li>)}</ol></>}
            <small>Audio scheduled does not prove sound was heard.</small>
            {mlVadNote && <p>{mlVadNote}</p>}
          </details>
        </div>
      </dialog>
      <dialog ref={clipDialog} className="glint-sheet glint-clip" aria-label="Recorded movement" onClose={event => event.currentTarget.querySelector("video")?.pause()}>
        <header className="glint-sheet-header"><h2>Recorded movement</h2><button className="glint-round" aria-label="Back to conversation" onClick={() => clipDialog.current?.close()}><X size={20}/></button></header>
        {lastTrackingClip && <video src={lastTrackingClip} controls playsInline aria-label="Recorded object movement clip"/>}
        <p>{objectMotion?.direction.replaceAll("-", " ")} · relative to the camera</p>
      </dialog>
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
