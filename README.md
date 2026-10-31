# Glint

A standalone AI companion for hands-on tasks. This first local slice is a **checkpoint prototype**, with a blue star companion, camera controls, hands-free voice conversation, optional link research, and session-only BYOK.

On a fresh page load, Glint takes a slow sideways waddle to the center, turns toward you, then gives off one warm bloom that fills the viewport before dissolving into the site. The 6.1-second intro has a discreet keyboard Skip control and Escape shortcut; reduced motion goes directly to the site. It never replays on in-app navigation or reconnect. See [docs/OPENING.md](docs/OPENING.md).

## Start locally

Requires **Node 24 LTS** and npm. No API key is required for the clearly labeled example replay.

```powershell
cd C:\Users\Parvathi\Documents\ChatGPT\Glint
npm ci
npm run dev
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100). The server binds only to loopback. A private, random, HttpOnly, SameSite device-session cookie separates local users; **this is not managed account authentication**. Local loopback uses HTTP. Do not expose this development server publicly.

Optional configuration is through environment variables `PORT`, `APP_ORIGIN` (must match the exact browser origin), and `GLINT_DATA_DIR`. `.env.example` contains no keys. The default command does not read env files; set variables in your shell, or use Node's `--env-file-if-exists=.env.local --import tsx server/index.ts` locally. Never put provider keys in env files for this BYOK flow or paste them into chat.

## Use Glint

The home screen starts with the blue star companion, conversation and camera controls. There is no task setup form.

1. **Open camera** starts the preview immediately. With a connected model it also starts voice chat, requesting microphone permission. Without a key the preview remains available locally. Camera and microphone are off by default.
2. **Connect model** accepts a session-only Meta API key and lists available Muse Spark models. Model listing does not verify voice, search or image access.
3. **Talk to Glint** starts one persistent microphone session. Speak naturally: local speech/silence detection submits each finished turn automatically, without a Send voice button. Muse Voice Transcribe recognizes the bounded WAV turn; Muse Spark streams the reply, and browser speech synthesis begins reading completed phrases before the full response ends. You can speak to interrupt or use Interrupt. **End voice chat** releases the microphone and cancels pending speech/work. Microphone silence sends no transcription calls; an enabled camera still performs its scheduled visual observations. Each utterance is bounded to 15 seconds; device echo handling and live provider latency still require validation.
4. Optional **Instructions** in the top right accepts one public HTTPS product/manual URL. Muse Spark's Responses API researches it with built-in web search. Sources appear under the answer. No cited search means a clear failure, not invented instructions. There is no unrestricted server-side fetch of user URLs and no claim every page/PDF is readable.
5. Camera awareness runs while the camera is open and a model is connected. Muse receives up to six ordered frames from the recent eight seconds, approximately every six seconds while idle. It compares them with the last activity summary and task context. Questions also carry recent frame history, not just one image. Local MediaPipe pose tracking supports quick person/hand-rise reactions. Meaningful changes can produce a short proactive response; unchanged scenes stay quiet. Voice takes priority over background observation. **Stop camera** stops the loop and clears its context. This is sampled temporal observation, not perfect recognition of every action or a full-FPS video upload. See [docs/VISUAL_AWARENESS.md](docs/VISUAL_AWARENESS.md).
6. **New task** cancels existing work and clears conversation/source context while retaining an unexpired connected key. Nothing is automatically marked complete.

The optional **illustrated example** preserves source review, no-key replay, dependency-aware user-reported progress and the previous checkpoint controls. It is demo content, not a manufacturer manual or live assessment.

Optional **Track object movement (SAM)** in the camera view records the next two seconds when clicked, submits a bounded MP4 clip to `sam-3.1`, and reports movement relative to the camera. Hold the phone still, name one object such as **computer mouse**, click the button, then move it while recording. SAM access is separate from Spark model-list access; video has a 50-frame billing minimum per request. This is experimental recorded-clip analysis, not continuous tracking. See [object tracking](docs/OBJECT_TRACKING.md) for format requirements, limits and verification.

Provider adapters and voice/link flows have fixture tests, not live provider verification. No real credentials or paid API calls were used during implementation.

## Privacy and key lifecycle

- Enter keys only in the app's masked field. The field is cleared on submission. No localStorage/sessionStorage, key persistence, request-body logs, analytics, raw provider error logs, or saved camera images are used.
- The backend necessarily processes the raw key in memory for calls to the allowlisted `https://api.meta.ai/v1` service. It is not a zero-access vault. Session-only keys expire after 15 idle minutes or two hours absolute; process restart requires reentry. Stop/disconnect/delete cancels paid work and discards the key mapping. Pause retains an unexpired key in memory and offers explicit Disconnect key.
- Optional progress saving stores only source instructions and user-reported task state in private local `.data/glint.sqlite`, with seven-day expiry. Without opt-in, task state remains in memory. Conversations and image bytes never enter SQLite. `.data` and secrets are ignored by Git and denied by the development server.
- One inference can run per session; extra observations receive a clear busy response rather than growing a queue. Forty provider dispatches (including voice transcription and research) per local session is an application dispatch allowance, **not a provider-account spending cap or a dollar estimate**. Reserved calls include provider errors and stale responses because they may still be charged. No automatic paid retries.
- BYOK pays only that provider. Public hosting, search, auth/database/storage, optional speech, and specialized compute need separate funding. No hosted service was purchased or deployed for this slice.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit/integration tests use fake provider responses. Browser tests use Chromium's synthetic camera and microphone, not your devices. See [docs/TEST_REPORT.md](docs/TEST_REPORT.md) for actual results and limits, and [TODO.md](TODO.md) for release gates.

## Public deployment is gated

`npm start` serves the built frontend but requires an HTTPS `APP_ORIGIN` and reviewed TLS proxy. It still binds to loopback. That guard is not a production certification: account auth, durable multi-instance sessions, media retention/security review, provider validation, accuracy/latency evaluations, cost estimates, and 60/90-minute device soaks must be completed first. No indefinite background/locked-screen capture is promised. Experimental browser TTS is output only and can be interrupted by typing or the explicit interrupt control; hands-free endpoint detection, interruption and streaming phrase playback are wired; real-device echo/latency qualification remains pending. This composes Meta transcription and text generation with browser speech, rather than claiming a native speech-to-speech model connection.

## Project layout

- `src/`: responsive UI, original SVG art, camera lifecycle, local quality worker.
- `shared/model.ts`: validated source/task types and original example.
- `server/engine.ts`: source confirmation, prerequisites, key lease, dispatch bounds, freshness and cancellation.
- `server/provider.ts`: allowlisted Meta model listing and image/text chat adapter; sanitized errors and validated decisions.
- `server/store.ts`: local SQLite progress only, never credentials or media.
- `server/app.ts`, `server/index.ts`: HTTP boundaries, private sessions, persistent status connection, loopback launch.
- `docs/`: standalone design/architecture/plan, provider references, implementation status, and tests.

The standalone design documents and original Glint concept assets are in `docs/`.

# Voice quality testing

Optional **Voice test diagnostics** records only event names and timings, with
no speech text or media. See [the evaluation guide](docs/VOICE_QUALITY_EVAL.md)
for the test matrix, playback evidence limits and content-free scoring command.
