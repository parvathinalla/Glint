# LiveKit voice prototype

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
6. Choose `GLINT_LIVEKIT_LLM_PROVIDER=baseten` with `BASETEN_API_KEY` and the
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
- Agent recording is explicitly disabled (`record:false`). Page transcripts are
  bounded to 60 entries and are not persisted by this feature. Provider retention
  and workspace-level logging policies are separate settings to review.
- Content-free agent logs include state transitions and numeric timing metrics.
  SDK/provider operational errors may have their own formats; do not upload raw
  logs publicly without review.
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
