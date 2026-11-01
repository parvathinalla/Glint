import {tracedFetch} from "./diagnostics";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Camera,
  Check,
  CheckCheck,
  CircleHelp,
  Eye,
  KeyRound,
  LoaderCircle,
  MicOff,
  MoreHorizontal,
  Pause,
  Play,
  Link,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { canReport, type Feedback, type View } from "../shared/model.ts";
import { Organizer, Spark } from "./Art.tsx";
import { asDataUrl, useCamera } from "./camera.ts";
import { CompanionHome } from "./CompanionHome.tsx";
import { saveKeyGateDismissed } from "./key-gate.ts";

type Message = {
  id: string;
  who: "you" | "glint";
  text: string;
  feedback?: Feedback;
};
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={dialog} className="modal" aria-label={title} onCancel={close}>
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export default function App() {
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [problem, setProblem] = useState("");
  const onProblem = useCallback((s: string) => setProblem(s), []);
  const camera = useCamera(onProblem);
  const [page, setPage] = useState<"home" | "work">("home");
  const [modal, setModal] = useState<"key" | "source" | "about" | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [conversation, setConversation] = useState(0);
  const [model, setModel] = useState("");
  const [mode, setMode] = useState<"replay" | "live">("replay");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState(false);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(Date.now());
  const keyField = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const clockOffset = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const stopSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const api = useCallback(
    async (
      path: string,
      body?: unknown,
      method = "POST",
      signal?: AbortSignal,
    ) => {
      const response = await tracedFetch(path,`/api/${path}`, {
        method,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-glint-csrf": viewRef.current?.csrf ?? "",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.message ?? "The request could not finish.");
      return value;
    },
    [],
  );
  const update = useCallback(
    async (path: string, body?: unknown, method = "POST") => {
      try {
        setProblem("");
        const value = (await api(path, body, method)) as View;
        setView(value);
        return value;
      } catch (e) {
        setProblem(
          e instanceof Error ? e.message : "Could not update the session.",
        );
        return null;
      }
    },
    [api],
  );
  useEffect(() => {
    let live = true;
    const start = Date.now();
    fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((v: View) => {
        if (!live) return;
        clockOffset.current = v.serverTime - (start + Date.now()) / 2;
        setView(v);
        if (v.task) {
          setMode(v.task.kind === "demo" ? "replay" : "live");
        }
      })
      .catch(() =>
        setProblem(
          "The local session could not connect. Check that the Glint server is running.",
        ),
      );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const chat = bottom.current?.parentElement;
    if (chat) chat.scrollTop = chat.scrollHeight;
  }, [messages, busy]);
  useEffect(() => {
    if (!view?.csrf) return;
    let live = true,
      retry: ReturnType<typeof setTimeout> | undefined,
      socket: WebSocket;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/events`,
      );
      socket.onopen = () => {
        if (live) setOnline(true);
      };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "status") setView(data.view);
        } catch {
          /* Ignore invalid heartbeat. */
        }
      };
      socket.onclose = () => {
        if (!live) return;
        setOnline(false);
        camera.stop();
        stopSpeech();
        request.current?.abort();
        setFeedback(null);
        retry = setTimeout(async () => {
          if (!live) return;
          try {
            const refreshed = (await fetch("/api/session", {
              credentials: "same-origin",
              cache: "no-store",
            }).then((r) => r.json())) as View;
            if (!live) return;
            const sameSession = refreshed.csrf === viewRef.current?.csrf;
            setView(refreshed);
            if (!refreshed.task) {
              setPage("home");
              setMessages([]);
            }
            if (sameSession) connect(); // A new CSRF identity restarts this effect instead.
          } catch {
            if (live) retry = setTimeout(connect, 3000);
          }
        }, 3000);
      };
    };
    connect();
    return () => {
      live = false;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [view?.csrf, camera.stop, stopSpeech]);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden") {
        camera.stop();
        stopSpeech();
        request.current?.abort();
        setFeedback(null);
        void update("phase", { phase: "paused" });
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [camera.stop, stopSpeech, update]);
  useEffect(() => {
    if (feedback && now + clockOffset.current > feedback.expiresAt && speaking)
      stopSpeech();
  }, [now, feedback, speaking, stopSpeech]);

  async function changePhase(
    phase: "active" | "paused" | "ready",
    withCamera = false,
  ) {
    stopSpeech();
    request.current?.abort();
    setFeedback(null);
    if (phase !== "active") camera.stop();
    if (withCamera && !(await camera.start())) return;
    const v = await update("phase", { phase });
    if (!v) camera.stop();
  }
  async function connectKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = keyField.current?.value ?? "";
    if (keyField.current) keyField.current.value = "";
    setConnecting(true);
    const v = await update("key", { key });
    setConnecting(false);
    if (v?.key.connected) {
      setModel(v.key.models[0] ?? "");
      setModal(null);
    }
  }
  async function respond(check: boolean) {
    const v = viewRef.current;
    if (!v?.task || busy) return;
    stopSpeech();
    setProblem("");
    let image: string | undefined,
      capturedAt = Date.now() + clockOffset.current;
    if (check && mode === "live") {
      if (!camera.active) {
        setProblem("Start your camera before checking a live view.");
        return;
      }
      const frame = await camera.sample();
      if (!frame) {
        setProblem("The camera is still preparing. Try again in a moment.");
        return;
      }
      capturedAt = frame.at + clockOffset.current;
      image = await asDataUrl(frame.blob);
    }
    const text = check ? "Can you check my current view?" : question.trim();
    if (!text) return;
    setQuestion("");
    setBusy(true);
    setMessages((m) =>
      [...m, { id: crypto.randomUUID(), who: "you" as const, text }].slice(-12),
    );
    const controller = new AbortController();
    request.current = controller;
    try {
      const f = (await api(
        check ? "check" : "chat",
        {
          mode,
          question: text,
          image,
          capturedAt,
          model: model || v.key.models[0] || "",
          revision: v.task.revision,
          epoch: v.epoch,
          requestId: crypto.randomUUID(),
        },
        "POST",
        controller.signal,
      )) as Feedback;
      const current = viewRef.current;
      if (
        current?.epoch !== f.epoch ||
        current.task?.revision !== f.revision ||
        Date.now() + clockOffset.current > f.expiresAt
      )
        return;
      setFeedback(f);
      setMessages((m) =>
        [
          ...m,
          {
            id: crypto.randomUUID(),
            who: "glint" as const,
            text: f.message,
            feedback: f,
          },
        ].slice(-12),
      );
      if (voice && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(f.message);
        utterance.rate = 1;
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        setSpeaking(true);
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setProblem(
          e instanceof Error ? e.message : "The check could not finish.",
        );
    } finally {
      setBusy(false);
      if (request.current === controller) request.current = null;
    }
  }
  const task = view?.task;
  const completed =
    task?.steps.filter((s) => s.status === "user-reported").length ?? 0;
  const nextStep = task?.steps.find(
    (s) => s.status === "pending" && canReport(s, task),
  );
  const state = busy
    ? "thinking"
    : speaking
      ? "speaking"
      : view?.phase === "paused"
        ? "paused"
        : camera.active
          ? "observing"
          : "ready";
  const keyLive = !!view?.key.connected;
  const fresh = feedback && now + clockOffset.current < feedback.expiresAt;

  return (
    <div className="app-shell">
      <main tabIndex={-1}>
        {page !== "home" && <header className="topbar">
          <button
            className="brand"
            onClick={() => {
              camera.stop();
              stopSpeech();
              request.current?.abort();
              setPage("home");
            }}
            aria-label="Glint home"
          >
            <Spark small />
            <span>
              glint<span className="brand-dot">.</span>
            </span>
          </button>
          <div className="top-actions">
            <button
              className="button new-task-action"
              onClick={async () => {
                camera.stop();
                stopSpeech();
                request.current?.abort();
                const result = await update("new", {});
                if (result) {
                  setPage("home");
                  setConversation((n) => n + 1);
                  setMessages([]);
                  setLinkOpen(false);
                }
              }}
              aria-label="New task"
            >
              <Plus size={16} />
              <span>New task</span>
            </button>
            <button
              className="button instructions-action"
              aria-label="Add instructions link"
              onClick={() => {
                camera.stop();
                stopSpeech();
                request.current?.abort();
                setPage("home");
                setLinkOpen(true);
              }}
            >
              <Link size={16} />
              <span>Instructions</span>
            </button>
            <button
              className="icon-button about-button"
              aria-label="About this preview"
              onClick={() => setModal("about")}
            >
              <CircleHelp size={17} />
            </button>
            <button
              className="button key-button"
              onClick={() => setModal("key")}
            >
              <KeyRound size={16} />
              {keyLive ? "Model connected" : "Connect model"}
              {keyLive && <span className="key-dot" />}
            </button>
          </div>
        </header>}
        <div className="main-content">
          {problem && (
            <div className="notice error" role="alert">
              <CircleHelp size={18} />
              <span>{problem}</span>
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setProblem("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!view && (
            <div className="loading">
              <LoaderCircle className="spin" /> Preparing your workspace…
            </div>
          )}
          {view && page === "home" && (
            <CompanionHome
              key={conversation}
              view={view}
              online={online}
              model={model}
              api={api}
              connect={() => setModal("key")}
              onView={setView}
              linkOpen={linkOpen}
              closeLink={() => setLinkOpen(false)}
              openLink={() => setLinkOpen(true)}
            />
          )}
          {view && task && page === "work" && (
            <>
              <section className="workspace-heading">
                <div>
                  <p className="eyebrow green">
                    {task.kind === "demo"
                      ? "GUIDED EXAMPLE · ORIGINAL DEMO INSTRUCTIONS"
                      : "YOUR TASK · USER-SUPPLIED SOURCE"}
                  </p>
                  <h1>{task.title}</h1>
                  <p>{task.identity}</p>
                </div>
                <button
                  className="button source-button"
                  onClick={() => setModal("source")}
                >
                  <BookOpen size={17} /> View instructions
                </button>
              </section>
              {!task.confirmed && (
                <section className="confirm-source">
                  <span className="section-icon">
                    <BookOpen size={23} />
                  </span>
                  <div>
                    <h2>Let’s make sure we have the right instructions.</h2>
                    <p>
                      {task.kind === "demo"
                        ? "These are original example instructions, not a manufacturer manual. Review the illustrated task before trying the replay."
                        : "Check the exact identity, source text, and step order. Glint has not verified this source externally."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => setModal("source")}
                    >
                      Read the source and steps <ArrowRight size={15} />
                    </button>
                  </div>
                  <button
                    className="button primary"
                    onClick={() =>
                      void update("confirm", { revision: task.revision })
                    }
                  >
                    <Check size={17} /> Confirm this exact source
                  </button>
                </section>
              )}
              <div className="work-grid">
                <div className="observation-column">
                  <section
                    className={`camera-card ${camera.active ? "camera-active" : ""}`}
                  >
                    <div className="camera-top">
                      <span className="camera-status">
                        <i />
                        {camera.active
                          ? "Camera active"
                          : mode === "replay"
                            ? "Example replay"
                            : "Camera off"}
                      </span>
                      <span>
                        {busy
                          ? "Checking selected view…"
                          : feedback
                            ? `${Math.max(0, Math.floor((now + clockOffset.current - feedback.capturedAt) / 1000))}s since last check`
                            : "No live analysis yet"}
                      </span>
                    </div>
                    <video
                      ref={camera.video}
                      className={camera.active ? "video visible" : "video"}
                      muted
                      playsInline
                      aria-label="Your live camera preview"
                    />
                    {!camera.active && (
                      <div className="camera-placeholder">
                        {mode === "replay" ? (
                          <>
                            <Organizer assembled={completed >= 4} />
                            <div className="replay-label">
                              <Play size={13} /> ILLUSTRATED REPLAY · NOT YOUR
                              CAMERA
                            </div>
                          </>
                        ) : (
                          <>
                            <Camera size={44} strokeWidth={1.2} />
                            <h2>Your workspace, when you’re ready.</h2>
                            <p>Camera stays off until you start it.</p>
                            <span>No audio is captured in this preview.</span>
                          </>
                        )}
                      </div>
                    )}
                    <div className="camera-bottom">
                      <span>
                        <Eye size={15} />
                        {camera.active
                          ? camera.hint
                          : "A clear view makes a thoughtful check."}
                      </span>
                      <span className="buffer-note">
                        {camera.active
                          ? `${camera.buffer.count} frames · ${(camera.buffer.bytes / 1048576).toFixed(1)} MB local`
                          : "You’re in control"}
                      </span>
                    </div>
                  </section>
                  <div className="session-controls">
                    <div className="control-group">
                      {view.phase !== "active" ? (
                        <button
                          className="button primary"
                          disabled={!task.confirmed}
                          onClick={() =>
                            void changePhase("active", mode === "live")
                          }
                        >
                          <Play size={17} />
                          {mode === "replay" ? "Start replay" : "Start camera"}
                        </button>
                      ) : (
                        <button
                          className="button"
                          onClick={() => void changePhase("paused")}
                        >
                          <Pause size={17} /> Pause
                        </button>
                      )}
                      <button
                        className="button"
                        disabled={view.phase === "ready"}
                        onClick={() => {
                          void changePhase("ready");
                          void update("key", undefined, "DELETE");
                        }}
                      >
                        <Square size={15} /> Stop
                      </button>
                    </div>
                    <button
                      className="button check-button"
                      disabled={
                        !task.confirmed ||
                        view.phase !== "active" ||
                        busy ||
                        !online ||
                        (mode === "live" && !keyLive)
                      }
                      onClick={() => void respond(true)}
                    >
                      {busy ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <Sparkles size={17} />
                      )}{" "}
                      Check now
                    </button>
                  </div>
                  <div className="mode-row">
                    <span className="mode-label">
                      {mode === "replay" ? (
                        <>
                          <span className="status-dot amber" /> Replay · no
                          model call
                        </>
                      ) : (
                        <>
                          <span className="status-dot" /> Live checkpoint ·
                          selected still only
                        </>
                      )}
                    </span>
                    {task.kind === "demo" && (
                      <button
                        className="text-button"
                        onClick={() => {
                          camera.stop();
                          request.current?.abort();
                          stopSpeech();
                          void update("phase", { phase: "paused" });
                          setMode((m) => (m === "replay" ? "live" : "replay"));
                          setFeedback(null);
                        }}
                      >
                        {mode === "replay"
                          ? "Use my camera instead"
                          : "Back to replay"}
                      </button>
                    )}
                  </div>
                  <section className="step-card">
                    <div className="section-title">
                      <span className="eyebrow">
                        {nextStep ? "YOUR NEXT STEP" : "ALL STEPS REPORTED"}
                      </span>
                      <span>
                        {completed} / {task.steps.length} reported
                      </span>
                    </div>
                    <div className="current-step">
                      <span className="step-number">
                        {nextStep ? (
                          task.steps.indexOf(nextStep) + 1
                        ) : (
                          <Check size={22} />
                        )}
                      </span>
                      <div>
                        <h2>
                          {nextStep?.text ?? "Take a final look at your work."}
                        </h2>
                        <p>
                          {nextStep
                            ? nextStep.anchor
                            : "Completion is user-reported, not independently verified."}
                        </p>
                      </div>
                    </div>
                    <progress
                      className="progress-track"
                      aria-label="User-reported progress"
                      max={task.steps.length}
                      value={completed}
                    />
                    <details>
                      <summary>
                        All steps <MoreHorizontal size={17} />
                      </summary>
                      <ol className="step-list">
                        {task.steps.map((st) => (
                          <li key={st.id}>
                            <button
                              aria-label={`${st.status === "user-reported" ? "Undo" : "Report"} ${st.text}`}
                              className={`step-check ${st.status === "user-reported" ? "done" : ""}`}
                              disabled={
                                !task.confirmed ||
                                (st.status === "pending" &&
                                  !canReport(st, task))
                              }
                              onClick={() => {
                                setFeedback(null);
                                stopSpeech();
                                void update("step", {
                                  id: st.id,
                                  done: st.status !== "user-reported",
                                  revision: task.revision,
                                });
                              }}
                            >
                              {st.status === "user-reported" ? (
                                <Check size={14} />
                              ) : (
                                <span />
                              )}
                            </button>
                            <div>
                              {st.text}
                              <small>
                                {st.status === "user-reported"
                                  ? "User-reported · not visually verified"
                                  : canReport(st, task)
                                    ? "Ready when you are"
                                    : "Waiting for prerequisites"}
                              </small>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </details>
                    {nextStep && (
                      <button
                        className="text-button report-button"
                        disabled={!task.confirmed}
                        onClick={() => {
                          setFeedback(null);
                          stopSpeech();
                          void update("step", {
                            id: nextStep.id,
                            done: true,
                            revision: task.revision,
                          });
                        }}
                      >
                        <CheckCheck size={17} /> I’ve checked this step myself
                      </button>
                    )}
                  </section>
                </div>
                <section className="conversation">
                  <header>
                    <div className="companion">
                      <Spark small state={state} />
                      <div>
                        <h2>Here with you</h2>
                        <span>
                          {busy
                            ? "Thinking about your view"
                            : speaking
                              ? "Speaking · interrupt anytime"
                              : view.phase === "paused"
                                ? "Paused. Take your time."
                                : "Your AI task companion"}
                        </span>
                      </div>
                    </div>
                    <button
                      className={`icon-button ${voice ? "enabled" : ""}`}
                      aria-label={
                        voice
                          ? "Disable browser speech"
                          : "Enable experimental browser speech"
                      }
                      onClick={() => {
                        setVoice((v) => !v);
                        stopSpeech();
                      }}
                    >
                      {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
                    </button>
                  </header>
                  <div className="conversation-body" aria-live="polite">
                    <div className="initial-message">
                      <span className="message-label">GLINT</span>
                      <p>
                        {task.confirmed
                          ? "We have our instructions. Take your time, and ask whenever you need a hand."
                          : "First, let’s confirm the instructions. Then we can take it one step at a time."}
                      </p>
                    </div>
                    {messages.map((m) => (
                      <div key={m.id} className={`message message-${m.who}`}>
                        <span className="message-label">
                          {m.who === "you" ? "YOU" : "GLINT"}
                          {m.feedback && (
                            <span>
                              {m.feedback.mode === "replay"
                                ? "REPLAY"
                                : m.feedback.kind === "proposal"
                                  ? "PROPOSAL"
                                  : "MODEL RESPONSE"}
                            </span>
                          )}
                        </span>
                        <p>{m.text}</p>
                        {m.feedback?.observations.length ? (
                          <details className="evidence">
                            <summary>
                              <Eye size={13} /> Evidence and limits
                            </summary>
                            {m.feedback.observations.map((o, i) => (
                              <p key={i}>{o}</p>
                            ))}
                            <small>
                              {m.feedback.mode === "live"
                                ? "Model observations are unverified. No steps were automatically completed."
                                : "Illustrated replay; no real activity observed."}
                            </small>
                          </details>
                        ) : null}
                      </div>
                    ))}
                    {busy && (
                      <div className="thinking">
                        <span />
                        <span />
                        <span />
                        <small>Checking, with care…</small>
                      </div>
                    )}
                    <div ref={bottom} />
                  </div>
                  {speaking && (
                    <button
                      className="interrupt"
                      onClick={() => {
                        stopSpeech();
                        request.current?.abort();
                        void update("phase", { phase: view.phase });
                      }}
                    >
                      <Pause size={14} /> Interrupt speech
                    </button>
                  )}
                  <form
                    className="chat-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void respond(false);
                    }}
                  >
                    <label className="sr-only" htmlFor="question">
                      Ask Glint a question
                    </label>
                    <input
                      id="question"
                      value={question}
                      onFocus={stopSpeech}
                      onChange={(e) => {
                        stopSpeech();
                        setQuestion(e.target.value);
                      }}
                      maxLength={1000}
                      placeholder="Ask a question…"
                      disabled={!task.confirmed}
                    />
                    <button
                      type="submit"
                      disabled={
                        !question.trim() ||
                        busy ||
                        !task.confirmed ||
                        (mode === "live" && !keyLive)
                      }
                      aria-label="Send question"
                    >
                      <ArrowUp size={19} />
                    </button>
                  </form>
                  <footer>
                    <MicOff size={13} />
                    {voice
                      ? "Browser TTS experiment · text input only"
                      : "Text conversation · voice input not connected"}
                  </footer>
                </section>
              </div>
              <div className="workspace-footer">
                <span>
                  <ShieldCheck size={14} />{" "}
                  {task.remember
                    ? "Progress saved locally · 7 days"
                    : "Progress in memory · not saved"}{" "}
                  · camera images never saved to disk
                </span>
                <span>
                  {view.calls} / {view.limit} model calls ·{" "}
                  {fresh ? "Fresh response available" : "Check on request"}
                </span>
              </div>
            </>
          )}
        </div>
      </main>

      {modal === "key" && (
        <Modal
          title="Meta Model API"
          close={() => {
            setModal(null);
            if (!keyLive) saveKeyGateDismissed();
          }}
        >
          {problem && (
            <div className="notice error" role="alert">
              {problem}
            </div>
          )}
          {keyLive ? (
            <div className="connected-key">
              <p>
                <Check size={17} /> Key connected · expires{" "}
                {view?.key.expiresAt
                  ? new Date(view.key.expiresAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "soon"}
              </p>
              <label>
                Available model
                <select
                  value={model || view?.key.models[0]}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {view?.key.models.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <button
                className="button"
                onClick={async () => {
                  stopSpeech();
                  request.current?.abort();
                  await update("key", undefined, "DELETE");
                }}
              >
                Disconnect key
              </button>
            </div>
          ) : (
            <form onSubmit={connectKey}>
              <label htmlFor="provider-key">Provider API key</label>
              <input
                ref={keyField}
                id="provider-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                minLength={10}
                maxLength={512}
                placeholder="Enter your API key"
              />
              <button className="button primary full" disabled={connecting}>
                {connecting ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <KeyRound size={17} />
                )}{" "}
                {connecting ? "Checking access…" : "Connect"}
              </button>
            </form>
          )}
        </Modal>
      )}
      {modal === "source" && task && (
        <Modal title="Your confirmed source" close={() => setModal(null)}>
          <span className="chip light">
            {task.kind === "demo"
              ? "ORIGINAL DEMO · NOT A MANUFACTURER MANUAL"
              : "USER-SUPPLIED · NOT EXTERNALLY VERIFIED"}
          </span>
          <h3>{task.sourceTitle}</h3>
          <p>{task.identity}</p>
          {task.sourceUrl && (
            <a href={task.sourceUrl} target="_blank" rel="noreferrer">
              Open provided source URL <ArrowRight size={13} />
            </a>
          )}
          <h4>Source text</h4>
          <p className="source-text">{task.sourceText}</p>
          <h4>Reviewed steps</h4>
          <ol className="source-steps">
            {task.steps.map((s) => (
              <li key={s.id}>
                {s.text}
                <small>
                  {s.prereqs.length
                    ? `After ${s.prereqs.map((id) => Number(id.split("-")[1])).join(" and ")}`
                    : "No prerequisite"}
                </small>
              </li>
            ))}
          </ol>
          <p className="field-help">
            Source fingerprint {task.sourceHash.slice(0, 12)} · revision{" "}
            {task.revision}. Confirming acknowledges your source selection, not
            external authenticity or safety certification.
          </p>
          {!task.confirmed && (
            <button
              className="button primary full"
              onClick={async () => {
                const v = await update("confirm", { revision: task.revision });
                if (v) setModal(null);
              }}
            >
              <Check size={16} /> Confirm this exact source
            </button>
          )}
        </Modal>
      )}
      {modal === "about" && (
        <Modal title="A thoughtful first step" close={() => setModal(null)}>
          <Spark small />
          <p>
            Glint is an AI coach for hands-on tasks. This is a local checkpoint
            prototype, not a production-qualified service.
          </p>
          <ul className="about-list">
            <li>
              Camera awareness sends recent frame sequences to Meta
              automatically while enabled. Stop camera ends observation. Quick
              pose tracking runs locally; camera pixels are not sent to Google.
            </li>
            <li>
              Labeled example replay works without keys. It does not analyze
              your camera.
            </li>
            <li>
              Muse conversation, cited link research and hands-free voice turns
              are wired to Meta’s API but have not been live-verified here.
              Spoken replies use your browser. Continuous video reasoning,
              managed account auth and public hosting remain unconnected.
            </li>
            <li>
              Warmth without pretending: no human operator is watching, and a
              single image cannot verify an earlier action.
            </li>
          </ul>
          <details className="connection-details">
            <summary>Model connection details</summary>
            <p>
              The backend keeps your key in session memory, not browser storage
              or disk. Meta processes requests, and model, search and voice use
              may be billed to your account. Automatic camera observations count
              toward the same allowance. The local allowance is 100 provider
              calls. Live access has not been verified here. This development
              server uses loopback HTTP; public use requires HTTPS and account
              authentication.
            </p>
          </details>
          <p className="field-help">
            Use a low-risk, reversible task. Foreground camera use only;
            backgrounding pauses capture. No 60-minute reliability or accuracy
            claim is made.
          </p>
          {task && (
            <button
              className="button danger"
              onClick={async () => {
                camera.stop();
                stopSpeech();
                request.current?.abort();
                const v = await update("session", undefined, "DELETE");
                if (v) {
                  setPage("home");
                  setMessages([]);
                  setFeedback(null);
                  setModal(null);
                }
              }}
            >
              <RotateCcw size={16} /> Delete saved task and disconnect key
            </button>
          )}
        </Modal>
      )}
    </div>
  );
}
