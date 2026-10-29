# Glint local slice test report

October 28, 2026 · Windows · Node v24.11.1 · npm 11.6.2

Root: `C:\Users\Parvathi\Documents\ChatGPT\Glint`. Local preview: [http://127.0.0.1:3100](http://127.0.0.1:3100). This report covers the standalone checkpoint prototype, not production readiness.

## Architecture planning update

Revision 2 incorporates the supplied review into the architecture specification: submission runtime inventory, browser speech choice, task transition/conflict schema, freshness/clock contracts, object registry, asynchronous corrections, local stop, safety policy, cost degradation, PDF handling and opt-in replay evaluation. Checked the updated document for required sections and stale TTS-provider wording. Documentation only: no application tests, external provider calls or contest-eligibility verification were performed for this revision.

Added [the real-time architecture plan](GLINT_REALTIME_ARCHITECTURE_PLAN.md) with a Muse/SAM division of responsibilities, independent voice and vision lanes, proposed performance gates and a comparative evaluation protocol. Primary Meta and Google documentation was checked. This was a documentation-only change; application tests were not rerun, no paid model calls were made, and no comparative performance result is claimed. Existing implementation results below remain unchanged.

## Rolling activity awareness — latest verified implementation

Camera mode now performs automatic Muse observations using up to six timestamped frames from the recent eight seconds, targeted every six seconds while idle. Structured activity/scene/change context is kept in session memory and supplied to conversation. Questions include frame history and recent local pose events. Meaningful confident changes can generate proactive replies; quiet scenes should not be narrated. Person/hand-rise transitions use a local worker with pinned MediaPipe Pose Landmarker Lite. Voice interaction takes priority over background work; Stop camera terminates tracking, cancels observation, clears frames/events and clears server visual context. The obsolete repeated image prefix and per-message still-image caption are removed, including split-token prefix cleanup. Model capability is not limited to the local gesture list.

The local model is bundled with a verified hash and attribution. SDK 1.2.0 is pinned, with generated runtime prepared by install/dev/build hooks. Clean `npm ci` passed with no reported vulnerabilities after stopping a Windows-locked development executable; the successful reinstall took eight minutes. Generated runtime files are excluded from the dev watcher and lint. Production CSP permits WebAssembly compilation without allowing general unsafe script evaluation. No deployment was performed.

Verification: lint and build/typecheck passed. The final serial unit/integration run passed all 38 tests. The full 19-test browser run passed 15 tests and timed out in four older intro/dialog/accessibility checks under host contention; a targeted rerun passed those four. All 19 distinct checks therefore passed across the full run and follow-up. Intro recording is now opt-in via `GLINT_RECORD_INTRO=1`; its phase screenshots/assertions remain in routine checks. One parallel HTTP unit check exceeded its five-second limit; the complete serial rerun passed.

New browser evidence includes actual local pose-model inference on an attributed public documentation image (33 landmarks), plus fixture-driven automatic activity recognition before any question, proactive activity text, hand-rise acknowledgment, multi-frame questions and stopping observation after camera close. The resulting UI screenshot was inspected. Actual activity interpretation by Muse, private webcam accuracy, gaze/identity recognition and real-device end-to-end latency have not been validated by the agent. Tests used synthetic camera/audio and fixture Meta responses; no actual credentials, user camera content or paid inference calls were used. Automatic observations share the existing 40-dispatch allowance. See VISUAL_AWARENESS.md for behavior, rates, sources and limits.

## Hands-free conversation and retained camera replies — current

Talk to Glint starts one persistent, explicitly permitted microphone session. A local AudioWorklet feeds bounded speech/silence detection; about 850 ms of silence ends a detected utterance. Idle silence sends no provider requests. Turns are capped below 15 seconds and encoded as mono 24 kHz PCM WAV. Muse Voice Transcribe supplies text; the Muse Responses stream then supplies visible answer text. Browser speech reads completed phrases as more text arrives. End voice chat, background, disconnect, navigation/unmount and errors release microphone resources. Opening camera also starts voice when a model is connected. No Send voice button is required.

Speech can interrupt read-aloud or an in-flight reply, cancel the earlier epoch and submit a new automatic turn. Explicit Interrupt and typing are also supported. Muting takes effect for later streamed phrases, not only the current utterance. This is composed transcription/text/browser speech with local endpointing, not a claim of native speech-to-speech transport. Real-device noise/echo detection and live Meta latency still require qualification.

Companion image questions retain answers that arrive after five seconds. Images still must be fresh at dispatch, and returned answers are prefixed and labeled as snapshot observations. A fixture simulates a twelve-second response and verifies retention; old images are rejected before dispatch. The separate optional checkpoint/replay workspace retains its strict freshness gate. Camera buffer encoding contention receives a short retry and a missing frame no longer prevents a text/voice answer.

Streaming uses the documented Meta Responses SSE text events (https://dev.meta.ai/docs/protocols/responses). Only visible text deltas are forwarded, never reasoning. A terminal validated response or sanitized error is required. Research remains buffered until citations validate. HTTP origin/CSRF checks, one in-flight request, cancellation, size limits, key expiry and the shared 40-dispatch allowance remain enforced. Neither silence nor an error automatically dispatches a paid retry.

Verification: lint and build/typecheck passed; 33 unit/integration tests passed. The full 16-test Chromium suite passed. A final five-test voice rerun also passed after adding live mute handling; this includes a new streamed-mute regression, making 17 distinct browser checks covered across runs. Tests verify two automatic turns without a send press, read-aloud interruption followed by another turn, End voice track cleanup, silence suppression, utterance/WAV bounds, visible-only streaming, incremental authenticated HTTP delivery, delayed image retention, and immediate phrase playback/cancellation. Browser microphone input is synthesized by Web Audio and Meta responses are fixtures. No actual credentials, paid Meta calls, or real camera/microphone content were accessed by the agent. The backend was restarted with these changes; reconnect the session-only key once for live verification.

## Camera stability, response recovery and black/blue theme — latest

Development logs showed repeated full-page reloads caused by changes under `visual-proof/jelly`. Vite now ignores preview artifacts, generated screenshots/reports, docs and private storage. ESLint likewise excludes ignored visual-proof experiments. Camera startup exposes an Opening state, renders the video while permission/playback is preparing, and prevents repeated start clicks. A synthetic-camera regression writes a temporary ignored HTML file and waits across a heartbeat: no navigation, no lost draft and capture stays active.

The reported Muse error came from the response-status/schema rejection path; the screenshot alone does not establish the provider's precise incomplete reason. Response parsing now accepts nullable optional fields and distinguishes response-token exhaustion from other incomplete replies. Standard conversation uses minimal reasoning with a 4,096-token output allowance; URL research uses low reasoning with 8,192 tokens. Meta documents that reasoning consumes this allowance: https://dev.meta.ai/docs/reasoning . No automatic paid retry was added. Failed messages/transcripts are retained for an explicit Retry, new drafts are preserved, duplicate retry bubbles are avoided, and incomplete output is not spoken.

Talk to Glint is beside the message field (a labeled microphone icon on mobile), while camera controls remain near the star. The interface and intro now use a black/blue theme with dark surfaces and contrast-checked text. Desktop and mobile screenshots were visually inspected.

Verification: final lint and production build/typecheck passed; 26 unit/integration tests passed. The full 15-test browser run had 13 passes, one recording timeout and two low-contrast labels within one accessibility test. Those labels were corrected and the recording test given a 60-second allowance for screenshot/video work. A targeted rerun passed the intro, accessibility/privacy and failed-message Retry checks (3/3). All 15 distinct browser checks therefore passed across the full run and targeted rerun. New response tests cover nullable fields, reasoning/output budgets and incomplete replies without automatic retries. Browser voice/media/provider checks use fixtures and synthetic devices; no real microphone/camera or live paid Meta calls were used by the agent.

The backend was restarted with the fixes, clearing memory-only keys. The user must reconnect once to verify the reported behavior on their actual device and Meta account.

## Companion-first flow and blue star — current verification

The required setup form is removed from the UI. Home now exposes the star, immediate camera access, typed conversation and bounded push-to-talk. Instructions in the header accepts one optional public HTTPS link. Meta Responses provides Muse Spark conversation and built-in cited web research; Muse Voice Transcribe receives a maximum 15-second mono 24 kHz PCM WAV. Browser speech synthesis reads replies. With camera on, each message sends one fresh still, stated in the UI. Search without a completed search result and valid citations fails explicitly. No unrestricted direct fetch of user URLs was added. Conversation and the current researched summary are held in session memory; New task clears context. Keys, images, audio and chat are not persisted by the app. The shared 40-dispatch limit includes voice and research.

The key dialog now shows only Meta Model API, Provider API key and Connect (or connection management when connected). Detailed key/provider information is available under About. Removed the Local preview badge and idle Muse connection line. Star body/feet and intro material/bloom are blue; geometry, facial paths and gait are unchanged.

Final checks: lint passed; build including TypeScript passed; 24 unit/integration tests passed; all 14 Chromium browser tests passed. New tests cover task-free conversation context and reset, search contract/citations, cancellation and shared quota, ASR contract and sanitized errors, immediate synthetic camera start/stop, and a synthetic microphone turn followed by URL research with fixture provider responses. Existing source-review demo, privacy controls, responsive layouts, dialogs and automated WCAG checks pass. Desktop and mobile home screenshots were inspected. Intro phase screenshot tests now use a controlled clock because real-time captures sometimes missed short phases; recordings are visual evidence, not latency measurements.

No actual API key, live Meta inference/search/transcription, real camera or microphone input, paid service, or deployment was used. Live access, voice quality/latency, arbitrary-link coverage and continuous/full-duplex conversation remain unverified. The local server was restarted with the final backend.

## Clean home and restored avatar — latest verification

Follow-up: the task-entry card now also uses the existing smiling star instead of the green sparkle icon. Lint and production build/typecheck passed for this icon-only change; the browser suite above was not rerun for it.

Removed the sidebar/compact rail, breadcrumb, marketing hero and promotional sections. Home now focuses on task entry and an optional example. Replaced the header sparkle with the existing smiling golden star companion. Checked generated desktop, tablet and mobile layouts; desktop/mobile screenshots show the companion in the header. Darkened the example helper text to meet contrast requirements.

Restored the original compact SVG opening rig and added clipped jelly-like highlights, edges, bubbles and subtle sparkles; removed experimental Three.js code/dependencies. Inspected the front-facing screenshot. This is SVG shading rather than physical 3D refraction.

Latest local run: `npm run lint`, `npm run build` (including typecheck), `npm test` (20 tests), and `npm run test:e2e -- --workers=1` (12 tests) all passed. Browser coverage includes intro/skip, responsive layout, source confirmation, replay, synthetic camera, accessibility and private-data denial. The earlier full run had an intro timing timeout and an example-text contrast failure; the complete rerun passed after the contrast correction. No live provider calls or real camera captures were used.

## Opening redesign verification

### Side view leg and eye refinement

Latest October 28 correction is side-view-only: the prior two leg paths had different shaft widths, and the shared tall eye ellipse made the side gaze look narrow. Side-view legs now share a single substantial shoe/leg template with rounded upper joins and near/far shading; the accepted shoe style and length remain. The side-view near eye is rounder with its existing anchored highlight. Through the turn, the original frontal leg paths and eye proportions return unchanged. Large body, gait, timing, golden halo, viewport expansion, skip and reduced motion remain unchanged.

Final lint PASS; build/typecheck PASS; all **5 targeted rig/opening/reduced-motion checks PASS in 21.4 seconds**. Visually reviewed seven contact/swing poses per viewport at large scale, the desktop/mobile side view, and the unchanged front beat. Regenerated the recording and proof sheets at `test-results/glint-rig-desktop-gait-sheet.png` and `glint-rig-mobile-gait-sheet.png`. No full application rerun or paid service call was needed.

### Lighter reveal palette

**Superseding user clarification:** the almost-white version read as a blank screen. The final treatment uses a bright ivory core, a stronger golden halo with visible falloff, and one soft expanding ring. Glint remains visible through the peak instead of disappearing into a solid cream hold; the website appears through the dissolving glow. Body, accepted legs, gait, and sequence timing remain unchanged. Final lint/build/typecheck PASS; all 3 targeted opening checks PASS in **15.7 seconds**. Inspected regenerated desktop/mobile pre-peak, peak, dissolve, and final reveal frames; recording regenerated. Added proof at `test-results/glint-opening-dissolve-desktop.png` and `glint-opening-dissolve-mobile.png`. The pale palette described below is intermediate history, not the delivered treatment.

October 28 palette-only follow-up: changed the post-turn light gradient in `src/opening.css` from yellow/gold to white (`#ffffff`), near-white ivory (`#fffefa`), and pale ivory (`#fffdf6`). Avatar art, accepted legs, gait, 6.10-second timing, full-viewport mask expansion, and skip/reduced-motion behavior are unchanged. Lint PASS; build/typecheck PASS; all 3 targeted desktop/mobile opening and reduced-motion/keyboard-skip browser tests PASS in 16.2 seconds. Visually inspected the regenerated front-facing beat, early bloom, and full-viewport desktop/mobile light frames. Recording regenerated at `test-results/glint-opening-desktop.webm`. No full app rerun or paid call was needed for this palette-only adjustment.

### Profile correction and viewport light follow up

Inspected both user-supplied screenshots before correcting the intro. The distorted profile came from the edge-positioned face/pointed lower body and independently squeezed body layers through the turn. The current intro uses one stable, rounded SVG shell, an inset three-quarter face, an anchored near eye, and separate world-space foot contact. **The previous leg and shoe paths were retained as requested.** The feet remain behind the belly, and no scaleX compression is applied to shell or face. A dedicated front-facing beat now precedes the huge, soft-edged ivory-gold bloom. The bloom is a viewport sibling of the avatar, reaches all screen edges, holds briefly, and dissolves into the site. Total sequence: 6.10 seconds; reduced motion still bypasses it.

Actual checks: lint PASS, typecheck PASS, build PASS (main bundle about 348 KB / 107 KB gzip). Full browser regression: **12 tests passed in 1.2 minutes**, including the existing camera/source flows and two new rig tests. Following the final light-edge softening, all **5 targeted intro/rig/accessibility tests passed in 21.0 seconds**, and the production build passed again. Backend unit tests were not rerun for this visual change. The first time-stepped QA run exposed that the test clock was still advancing between captures; pausing the test clock made the gait/turn captures deterministic. That intermediate run is not passing evidence.

New regressions check that a planted foot stays fixed while the body advances, that only one shell remains through the turn without CSS compression, and that the huge light spans desktop/mobile viewport dimensions. Visually inspected seven gait poses on each viewport plus actual-time profile, midpoint turn, fully front-facing beat, huge bloom, and final reveal. The live-timed recording was regenerated. No key/model or camera action is triggered by the intro.

Current proof paths in `test-results/`: `glint-rig-desktop-gait-1.png` through `-7.png` and mobile equivalents; `glint-opening-turn-midpoint-desktop.png`, `glint-opening-front-beat-desktop.png`, `glint-opening-huge-bloom-desktop.png`, corresponding mobile files, final reveal frames, and `glint-opening-desktop.webm`. The earlier 5.45-second notes below are historical evidence superseded by this correction.

October 28 follow-up: added the character-only fresh-page opening and incorporated the request for a slower, larger, chubbier avatar. She waddles in profile for 3.20 seconds, settles, turns front, emits one warm light bloom, and reveals the site; total 5.45 seconds. Shared avatar art is rounder too. [OPENING.md](OPENING.md) documents timing, fresh-load policy, accessibility, and changed files.

Actual checks after the opening change: `npm run lint` PASS; `npm run typecheck` PASS; `npm run build` PASS (main bundle about 346 KB / 107 KB gzip); full `npm run test:e2e` PASS, **10 tests in 56.5 seconds**. The three opening tests cover ordered phases, distinct profile/front poses, hidden/inert site until reveal, no automatic camera/key/model calls, main-content focus, no replay on internal task navigation, mobile overflow, reduced-motion bypass, and keyboard skip. Existing seven source/camera/key/accessibility tests pass with an explicit wait for the intro. Backend unit tests were not rerun for this visual-only change; the 20-test result below is from the preceding local-slice verification.

Visually inspected desktop profile, centered profile, frontal bloom, and final reveal plus mobile walking, bloom, and final reveal. Proof files in `test-results/`: `glint-opening-01-profile-desktop.png`, `glint-opening-02-centered-desktop.png`, `glint-opening-03-light-desktop.png`, `glint-opening-04-revealed-desktop.png`, matching mobile frames, and `glint-opening-desktop.webm` (recorded by Playwright). No physical camera was accessed, new runtime dependency added, or paid service used. These checks do not establish live inference, long-session, or production readiness.

## Initial local slice checks

| Check | Result |
|---|---|
| Clean `npm ci` from current lockfile | PASS; 233 packages installed; audit reported zero vulnerabilities |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS; 20 tests across 3 files |
| `npm run build` | PASS; Vite 8.3.5; main JS about 342 KB / 105 KB gzip; local quality worker under 1 KB |
| `npx playwright install chromium` | PASS |
| `npm run test:e2e` | PASS; all 7 tests, 18.6 seconds in the final full run |
| `npm audit` | PASS; zero reported vulnerabilities after updating test/build tooling |
| Desktop/mobile visual review | Inspected welcome, workspace, synthetic camera, and 390px mobile screenshots. No horizontal overflow in the tested mobile flows; reduced-motion mode exercised |
| Automated accessibility | Axe WCAG 2 A/AA and 2.1 AA rules passed on welcome, confirmed workspace, key dialog, and source dialog. This is not a complete manual accessibility certification |

Node emits its experimental SQLite warning. SQLite is the local single-process progress implementation; it is not presented as a production database. ESLint's installed major emits a deprecation notice at install, while the audit reports no known vulnerabilities.

## Test coverage and evidence limits

Unit/integration tests exercise exact-source confirmation, invalid source/URL input, prerequisite blocking, either demo side-panel order, cascading undo, old/future/paused evidence rejection, duplicate observation IDs, one in-flight job, pause cancellation, late-result suppression, call-budget cutoff, key idle expiry/disconnect, cross-session key isolation, key nonexposure in views/SQLite, opt-in progress restoration without restoring keys, non-opt-in nonpersistence, documented Meta request shapes, sanitized upstream failures, and malformed/unknown-reference decisions. Buffer tests enforce byte, age, and burst-count bounds and expired-context release.

HTTP tests cover no-store and HttpOnly/SameSite cookies, missing-session rejection, origin/CSRF checks, separate task ownership, input limits, remote-image URL rejection, oversized bodies, and sanitized unexpected exceptions. Browser tests additionally verify direct private database/server/env URLs return 403. Live provider endpoints are not contacted by automated tests; adapter tests use fake fetch responses and test-only fake credentials.

Browser checks cover home and custom-task flows, source review/confirmation, no-key replay with explicit labels, progress order, masked key input with empty browser storage, camera capture and local buffered frames, Pause and Stop releasing tracks, disabled live checks without a key, mobile overflow, reduced motion, and accessible dialogs. Chromium uses `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`; this is a real browser API path with a synthetic device, **not physical webcam/phone evidence**. No real microphone was accessed.

Internal screenshots are in ignored `test-results/`: `glint-welcome-desktop.png`, `glint-workspace-desktop.png`, `glint-camera-desktop.png`, `glint-welcome-mobile.png`, and `glint-workspace-mobile.png`. They contain only original example content and a synthetic camera pattern.

## Corrections during verification

The first browser run had one ambiguous confirmation-button selector; it was scoped to the native dialog. Accessibility checks exposed low-contrast secondary copy, which was darkened. Private-resource checks prompted explicit denial before SPA fallback, including nonexistent env paths. The initial test-tool dependencies had advisories; updated Vite/Vitest tooling and a regenerated clean lockfile removed the reported advisories. All these earlier runs are failures or intermediate checks, not final passing evidence.

## Not run or not implemented

- No actual Meta key, model-list access, paid image/text inference, model accuracy, or end-to-end live provider latency was tested. The user's earlier reported 18.2-second image response remains prior evidence and exceeds the proposed five-second visual freshness limit.
- No physical-device, 60/90-minute soak, thermal/battery/bandwidth qualification, multiuser load, long outage, provider-credit failure against the live provider, or production security review. Restart recovery has unit-level store/key separation and implemented UI recovery logic, not a live process-failover browser certification.
- No automatic authoritative search, PDF/image manual extraction, native temporal clips, full continuous perception, speech input, measured full-duplex barge-in, managed account auth/PostgreSQL/object storage, optional specialized compute, or public deployment.
- Browser TTS is optional experimental output. Its actual audio/voice availability was not audibly tested.

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for current boundaries and [../TODO.md](../TODO.md) for release gates. The seven-day local progress option, forty-call allowance, and five-second image expiry are implemented policies; they do not prove production retention, provider-account hard spending limits, or achievement of task accuracy targets.
