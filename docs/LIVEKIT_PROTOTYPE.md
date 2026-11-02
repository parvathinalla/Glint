# LiveKit voice prototype

## Existing Glint cloud voice adapter

Set `GLINT_TTS_PROVIDER=livekit` to replace Kokoro synthesis on the original
Glint page with the configured LiveKit Inference TTS model and voice. This
requires `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GLINT_LIVEKIT_TTS_MODEL`, and
`GLINT_LIVEKIT_TTS_VOICE`. Restart the app. It uses the existing single PCM
reply/playback channel, not a second conversation agent or a LiveKit audio room.
Existing model prompts, camera tools, ASR, and cancellation remain in place.
The original Glint UI keeps cloud voice consistent: cloud failure leaves the reply
visible with a notice instead of silently switching to device speech. Explicitly
selecting device voice with the existing kill switch still works. Full room
transport is a later step.
Synthesis closes its stream on completion, failure, and cancellation; the SDK
connection pool is reused as described below.

### Incremental voice delivery

Cloud speech now reuses the SDK connection pool and emits roughly 120 ms PCM
chunks through the existing response channel. Each chunk has its own sequence;
only the first carries the sentence text. Cancellation drops late chunks. A
failure after partial playback does not replay that sentence in the device voice.
Streams close per sentence; pooled connections remain owned by the cached voice
for reuse. Local `/api/speech` announcements still collect their JSON response.

Safe answers can start synthesis from text deltas when camera actions are disabled
for that request. Turns offering camera tools still buffer text until validation,
so tool arguments and speculative action narration never enter the speech lane.
Model reasoning settings and speech-end timing are unchanged.

One synthetic Cartesia probe on this laptop measured first audio at 1705 ms with
sentence buffering, versus 257 ms and 397 ms with incremental delivery on two
subsequent calls. These are TTS-only samples, not end-to-end voice benchmarks or
guaranteed production latency. Provider load, network and connection warmth vary.

### Pause and playback reliability

Pause/end stop local media immediately and bound server confirmation to five
seconds. Superseded confirmations are aborted and late results are ignored. A
failed confirmation blocks subsequent model dispatch until a successful retry,
reconnection, or session reset; Start again retries an unconfirmed pause. Session
reset is also bounded. Local speech announcements have a twenty-second deadline.

Content-free playback summaries distinguish received, completed, dropped and
queued PCM chunks at cancellation, pause, resume and final drain. A started chunk
is not counted as completed until its audio source ends normally. Camera capture,
frame encoding and server first-text timings are logged separately to investigate
the remaining model/validation latency without changing reasoning or prompts.

This branch introduces an isolated `/livekit` page and a separately started Node
agent. `/` keeps the existing Glint camera, voice and image flow. This is a voice
comparison, not a production migration: camera/image tools, saved conversations,
managed user authentication and durable worker jobs are not wired into this path.

## Configure after creating a LiveKit Cloud project

1. Copy `.env.example` to ignored `.env.local`. Do not commit secrets.
2. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` from the project.
   Only `wss://*.livekit.cloud` project URLs are accepted in this first slice.
3. Generate a separate random `GLINT_LIVEKIT_ACCESS_CODE` (16+ characters) for
   invited testers. This is a temporary prototype gate, not production login.
4. Set `GLINT_LIVEKIT_ENABLED=1`. Restart the app after changing settings.
5. Explicitly choose `GLINT_LIVEKIT_STT_MODEL`, `GLINT_LIVEKIT_TTS_MODEL`, and
   `GLINT_LIVEKIT_TTS_VOICE` using LiveKit's supported model/voice catalog.
   These use **LiveKit Inference**; they are not covered by the BaseTen hackathon
   key. No model is silently selected or enabled by the code.
6. Recommended: choose `GLINT_LIVEKIT_LLM_PROVIDER=meta`, set server-only
   `MODEL_API_KEY`, and use `GLINT_LIVEKIT_LLM_MODEL=muse-spark-1.3` (requires
   access to that model). The browser's session-only Glint key is not shared
   with this worker. Meta requests use `https://api.meta.ai/v1`; there is no
   automatic fallback to another provider. Restart the worker after configuring.
   For the older comparison, choose `baseten` with `BASETEN_API_KEY` and the
   exact hackathon model `meta-models/muse-spark-open-1026`; alternatively use
   `fireworks`, `FIREWORKS_API_KEY` and a model available to that account.
   Adapter compatibility, model reasoning and Telugu accuracy need live testing.
7. Set `GLINT_LIVEKIT_AGENT_ENABLED=1` only when ready for inference usage.

The app and worker both load `.env.local`, falling back to `.env`. Deployment
environment variables take precedence. Do not use `VITE_` for secret variables.

## Run

```sh
npm install
npm run livekit:download
npm run dev
```

In a separate terminal:

```sh
npm run livekit:agent -- dev
```

Open `http://127.0.0.1:3100/livekit` (or the configured app port), enter the
prototype access code and explicitly click Join voice prototype. Grant microphone
permission when prompted. Start the named worker before joining. Do not run the
legacy Glint microphone in another tab during an A/B test.

For a deployed worker use `npm run livekit:agent -- start`. No cloud deployment
or provider inference is triggered merely by building the frontend.

## Lifecycle and boundaries

- Cookie, same-origin and CSRF validation protect issuance and cleanup routes.
- The access code is checked server-side and never stored in browser storage.
- One opaque room/participant per local app session; short-lived 5-minute join
  tokens allow microphone publication and subscription only. They cannot create
  arbitrary rooms, administer rooms, publish camera tracks or publish data.
- Named agent dispatch is embedded in room configuration. A join token expiring
  does not disconnect an existing connection; the worker separately enforces a
  five-minute agent session duration. The worker must stay running to enforce it.
- End session disconnects browser media and requests cloud room deletion. A failed
  cleanup is reported and can be retried. Page exit sends best-effort cleanup;
  crashed browsers still depend on room departure timeouts and worker lifecycle.
- The existing app's 100-call quota does not cover this independent prototype.
  Use the access gate, provider budgets and test duration controls. Do not expose
  this as an unrestricted public service.
- The prototype does not construct legacy ASR sockets, device speech queues or
  Kokoro players. Remote audio is attached once via the LiveKit client.
- Transcription uses only `lk.transcription` text streams, keyed by participant
  identity and `lk.segment_id`. Interim/final streams update one entry; a late
  partial cannot overwrite a final transcript. Repeated words in distinct real
  turns are preserved rather than deduplicated by text.
- Agent recording is explicitly disabled (`record:false`). Page transcripts are
  bounded to 60 entries and are not persisted by this feature. Provider retention
  and workspace-level logging policies are separate settings to review.
- The `livekit:agent` command runs an output-filtering launcher. SDK info/debug
  records are dropped, warning/error records are reduced to classified events,
  and our timing/state records use an explicit allowlist. Tagged SDK transcript
  fields and unstructured text are not forwarded into the new launcher logs.
  Historical logs from the earlier launcher may contain conversation text; they
  are private ignored files and have not been rewritten by this change.
- Do not invoke `server/livekit-worker.ts` directly for normal runs: that bypasses
  the output filter. Both the runner and worker PID are recorded privately in
  `.data/livekit/runtime.json` for controlled shutdown.
- The worker uses the SDK server API directly. SDK 1.9.5's CLI overrides log-level
  options and reconstructs `ServerOptions`, converting zero idle processes into
  the production default. The launcher preserves zero idle warm processes and a
  60-second initialization timeout; tests cover those effective settings.
- Production CSP permits LiveKit Cloud HTTPS/WSS only when configured. Existing
  script/eval restrictions remain in place. Regional signaling uses LiveKit Cloud
  subdomains. No arbitrary user-supplied signaling hostname is accepted.
- Sessions, access-rate windows and room ownership are still held in app memory.
  Restart recovery and distributed ownership remain future production work.

## Compare before migration

Use identical English/Telugu questions, pauses and background noise for both paths.
Measure speech-end to first audible answer, interruption stop time, missing/duplicate
turns, transcription accuracy, disconnect/reconnect, idle periods and per-minute
usage. Keep model/provider changes separate when interpreting improvements.
No latency or accuracy improvement is established until these live comparisons run.

## First live test findings

The first user test included intentional background-speaker interruptions. These
must not be counted as accidental noise. This prototype does not identify which
person is speaking. A speech-triggered pause alone is not a failure.

The browser showed repeated interim/final transcripts because it consumed both
legacy events and text streams, then keyed streams by stream ID. Worker logs also
showed repeated initialization timeouts and SDK transcript fields despite our own
metrics being content-free. The follow-up fixes address these observed problems.

The five-minute agent limit overlapped the user's last speech. The page now
explains the limit and ends browser media with a rejoin notice at its own deadline.
Agent departure also disconnects the browser session instead of leaving it listening
without an agent.

Old metrics showed model request durations of roughly 1.2–4.5 seconds and a median
TTS first-byte time of about 237 ms. These are different measurements, not full
user-perceived latency. New metrics include cancellation, speech IDs, token counts,
reasoning counts and end-of-turn/transcription delays to distinguish causes.

A real isolated-room smoke test received an RTC audio frame and deleted the room
without publishing microphone audio or recording media. Its startup-to-first-frame
time was about 43 seconds under local resource pressure. An audio frame can be
silence, so this is a transport/agent-startup check, not proof of an audible reply
or a latency improvement. The smoke test intentionally canceled its greeting during
cleanup, which is reflected as canceled model metrics. No image task was dispatched.

Follow-up verification: all 360 unit/integration tests across 41 files passed;
10 focused LiveKit tests were also rerun after the logging changes. Nine browser
checks passed after separating the legacy app's eager imports from the prototype
route. Earlier cold development-server navigations exceeded the 30-second test
timeout on this resource-constrained laptop; the final run passed, including
production CSP, transcript replacement, session deadline and legacy workspace
checks. Build, TypeScript, lint and diff checks passed. The worker registered,
returned HTTP 200 on its health endpoint and showed no further runner-init timeout
events during the observed post-restart period. That observation does not establish
production capacity or eliminate the remaining model/turn-detection latency.

## Reasoning-budget and pause follow-up

The next live test confirmed a completed (not canceled) Muse Spark request using
600 completion tokens, 597 of them reasoning tokens, with no first visible token.
Another reply took about 7.1 seconds to its first text token. Several other TTS
outputs were canceled after new detected speech; those are distinct from empty
model output and intentional background-speaker interruption tests.

For BaseTen Muse Spark Open, the agent now explicitly requests low reasoning
effort and allows 2048 completion tokens, including reasoning. The old 600-token
cap could consume the entire budget before a useful spoken response. Other
provider/model combinations do not receive an unverified reasoning parameter.
The separate voice agent still uses the configured model; it is not the legacy
Glint task engine. Its actual model, provider, STT and TTS are advertised through
participant attributes and shown on the page after joining, without API secrets.

The voice pipeline waits 1200 ms of end-of-turn silence instead of the previous
500 ms default to accommodate natural within-sentence pauses. This adds up to
700 ms to ordinary endpointing, so it is a deliberate turn-quality tradeoff,
not a blanket latency reduction. Interruption handling remains enabled and does
not perform speaker identification. The greeting is kept short.

A normally completed stream with no visible answer now emits a short honest
fallback instead of silence. Cancellation and provider errors propagate, and the
fallback does not make another model call or expose hidden reasoning.

Validation: 15 focused unit/integration tests passed, including a local HTTP test
of the installed LiveKit adapter's actual `reasoning_effort: low` and
`max_completion_tokens: 2048` payload, empty reply recovery, canceled streams and
provider errors. Five browser scenarios passed, including model identification,
transcript updates, mic controls, cleanup and production CSP. Build, TypeScript
and lint passed.

Two synthetic calls to the actual hackathon endpoint with the new settings
completed with nonempty text and `finish_reason: stop`. First visible text was
about 1.2 and 3.0 seconds; reasoning used 74 and 166 tokens. These are small model
compatibility checks, not end-to-end voice or long-context benchmarks. They used
provider inference; no user microphone/camera data was sent by those probes.

Reference: https://docs.baseten.co/inference/model-apis/reasoning

Automated checks use fake credentials and mocked API responses. They cover token
scope, expiry, disabled mode, access checks, rate limits, cleanup retry and canceled
joins without starting media. They do not qualify real WebRTC media or provider
compatibility. A real project is required to complete those checks.

## Sources

Verified in this slice: 355 unit/integration tests across 40 files, five focused
browser checks (including the existing production CSP/VAD regression), TypeScript,
build and lint passed. The browser connection-success test mocks the LiveKit SDK
transport; it is not a live WebRTC qualification. The actual agent CLI loads and
shows help with test-only configuration, and native Silero VAD initializes locally.

The ONNX installer dependency `adm-zip` is overridden to patched `0.6.1`; native
VAD initialization was checked after that change. The installation audit reports
remaining moderate advisories. No high/critical advisory remained in that audit;
this is not a complete security review.

- https://docs.livekit.io/agents/start/voice-ai/
- https://docs.livekit.io/frontends/reference/tokens-grants/
- https://docs.livekit.io/agents/logic/sessions/
- https://docs.livekit.io/agents/models/llm/fireworks/
- https://docs.livekit.io/agents/models/tts/baseten/

The BaseTen TTS integration above requires separate TTS access. This prototype
does not assume the Muse Spark hackathon key grants it.
