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

The site opens directly to **Start Glint**, then a glossy blue-star companion home. There is no walking intro, home typing bar, demo or voice-training flow. Typed input remains in **Conversation**.

1. **Camera** starts the preview without also starting the microphone. Flip cameras, expand fullscreen, then return to the same session. Mic and camera are independently controlled.
2. **Talk** starts hands-free voice after connecting a model. Local speech detection ends turns; live Muse transcription or bounded WAV fallback feeds Muse Spark. Kokoro has a four-second deadline with device-speech fallback. Noise and overlapping-speaker accuracy still require real-device validation; old voiceprints no longer gate turns.
3. **Conversation** opens a sheet with typed input, live replies, source links and inline movement checks. Closing the sheet returns to home/camera without ending the session.
4. **Settings** contains System/Light/Dark appearance, spoken replies, captions, object-analysis permission, masked session-key management, optional public instructions links and opt-in voice diagnostics. Appearance persists locally; keys do not.
5. **Camera awareness** checks recent ordered frames approximately every six seconds while connected and idle. These checks consume session calls. Voice takes priority. This is sampled visual context, not full-FPS video understanding.
6. Ask **“Which way did I move the mouse?”** or **“Track the mouse.”** A conservative local intent route supports common named objects; it is not a general-purpose tool agent. Without fresh movement evidence, Glint asks for another movement and shows a readiness card. Open the camera if needed, then explicitly choose **Ready — check movement**. A bounded two-second SAM clip is analyzed; results and an optional recorded-clip viewer appear in the same chat. Unclear objects prompt clarification. Unsupported MP4 capture fails before dispatch. Enabling analysis alone does not start recording. SAM video has a 50-frame billing minimum and separate entitlement. See [object tracking](docs/OBJECT_TRACKING.md).
7. **End session** cancels work and stops camera/microphone. **Start again** returns to the companion with both off. It does not reset the server's 100-call session allowance.

Look requests now offer an optional Muse Image photo preview inside Conversation. Choose or take a photo, describe the edit, then press Generate preview. Follow-up edits use the last preview. See [photo previews](docs/LOOK_PREVIEWS.md) for limits and testing.

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
