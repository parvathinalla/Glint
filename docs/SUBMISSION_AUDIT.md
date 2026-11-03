# Task 0: submission scope audit

Reviewed 3 November 2026, pre-edit main `e29de4e`. README line numbers below refer to the original preserved in `build-log.md`. Canonical design: `GLINT_DESIGN_DOCUMENT.md`, approved 28 October. Design requirements do not prove implementation.

LIVE means a reachable provider adapter and relevant automated coverage exist. It does not mean a paid real-account run, demo-video inclusion, accuracy or latency has been verified. FIXTURE-ONLY means deterministic evidence only. No numeric test total is published until the user supplies command output.

GitHub metadata was read from the repository API: public; created 2026-10-29T00:09:27Z, inside the supplied event window. Description, topics, homepage and detected license were empty. Git history begins 28 October. This supports timing, but cannot prove all assets were authored during the event. The supplied 211-file and docs/test-file counts were not adopted as facts.

| Claim | Where claimed | Implementation | Relevant test | Verdict |
| --- | --- | --- | --- | --- |
| Hands-busy camera/voice companion | README:3,25-28 | src/CompanionHome.tsx; src/camera.ts; src/microphone.ts | tests/e2e/conversation-ui.spec.ts; tests/e2e/camera-controls.spec.ts | LIVE implementation; usefulness needs a live demo |
| Muse Spark model family | README:26; no exact ID | server/agent-provider.ts:90 uses selected model from connected account | tests/agent.test.ts; tests/agent-stream.test.ts | LIVE family; exact muse-spark-1.3 needs selected-model receipt |
| muse-spark-1.3 specifically | User request; isolated agent config | Main model is selected dynamically; comparison config is not main runtime proof | tests/livekit-runtime.test.ts only supports comparison configuration | [NEEDS EVIDENCE: main runtime selected ID] |
| Realtime Muse transcription | README:26,129-132 | server/asr-provider.ts:12-13; server/engine.ts voiceOpen | tests/asr-provider.test.ts; tests/voice-stream.test.ts; tests/voice-client.test.ts | LIVE implementation; account/device receipt absent |
| WAV transcription recovery | README:26,132 | server/agent-provider.ts:353; server/app.ts /api/voice | tests/agent.test.ts; tests/http.test.ts | LIVE recovery; automatic recovery exists, so not fully opt-in as required |
| SAM 3.1 movement analysis | README:30 | server/sam-provider.ts:25; engine.trackMotion; /api/track; CameraTaskRunner | tests/sam-provider.test.ts; tests/object-motion.test.ts; tests/e2e/object-tracking.spec.ts | LIVE implementation, not independently live-verified; optional until receipt |
| SAM always requires Ready button | README:30 | src/CompanionHome.tsx:555,842; shared/camera-tools.ts | tests/e2e/camera-coordinator.spec.ts; tests/tracking-intent.test.ts | CONTRADICTED: button applies to legacy route; default uses validated model tools |
| SAM 50-frame billing minimum | README:30 | No billing contract enforced in code | No local test establishes external billing policy | [NEEDS EVIDENCE: current provider billing source]; omit numerical billing claim |
| Muse Image previews and edits | README:33 | server/image-provider.ts:10; /api/look-preview; browser runner | tests/look-preview.test.ts; tests/e2e/look-preview.spec.ts; tests/camera-tool-provider.test.ts | LIVE implementation; QUARANTINE from focused cooking submission |
| Prompts stay internal | README:95-101 | server/agent-provider.ts tool validation; server/app.ts action return skips TTS | tests/camera-tool-provider.test.ts; tests/e2e/camera-coordinator.spec.ts | LIVE logic; actual audio requires verification |
| Cloud streaming TTS | README:26,62 | server/tts-livekit.ts; server/tts-stream.ts | tests/tts-livekit.test.ts; tests/tts-stream.test.ts | LIVE implementation, CONTRADICTS submission browser-speech-only scope |
| Kokoro local TTS | README:26 | server/tts-kokoro.ts; scripts/prepare-tts.mjs | tests/tts.test.ts | EXPERIMENTAL for submission; normal profile may select it |
| Separate /livekit agent | README:84-87 | src/main.tsx; server/livekit.ts; server/livekit-agent.ts | tests/livekit.test.ts; tests/livekit-runtime.test.ts; tests/e2e/livekit.spec.ts | EXPERIMENTAL comparison, not main Glint pipeline |
| Browser speech | README:26,67 | src/speech-queue.ts; explicit neural-voice kill switch in src/voice-player.ts | tests/speech.test.ts; tests/voice-player.test.ts | LIVE selectable path; not current default before this audit |
| Camera starts independently of microphone | README:25 | CompanionHome openCamera/toggleMic | tests/e2e/camera-controls.spec.ts | LIVE |
| Camera flip/fullscreen/captions | README:25,28 | src/camera.ts; CompanionHome | tests/e2e/camera-controls.spec.ts; tests/subtitles.test.ts | LIVE |
| Themes, key controls, settings | README:28 | src/appearance.ts; src/App.tsx; CompanionHome | tests/e2e/conversation-ui.spec.ts; tests/e2e/key-gate.spec.ts | LIVE |
| Camera background checks: off, 30 seconds, 20/page, 10 calls reserved | README:29 | CompanionHome observationTick at 1143+ | tests/visual-events.test.ts; tests/e2e/vision.spec.ts cover parts, not a live timing qualification | LIVE gates; no real-device monitoring guarantee |
| End session and Start again do not reset 100 allowance | README:31 | CompanionHome endSession; engine.phase; engine.MAX_SESSION_CALLS | tests/engine.test.ts; tests/e2e/voice.spec.ts | LIVE |
| Key session-only; 15 idle minutes / 2 absolute hours | README:39-40 | engine.connect/expireKey; /api/key | tests/engine.test.ts; tests/http.test.ts; tests/e2e/key-gate.spec.ts | LIVE application handling; external providers still process requests |
| Stop always discards key mapping | README:40 | engine.phase(paused) retains lease; disconnect/forget remove it | tests/engine.test.ts | CONTRADICTED unless Stop means explicit disconnect/delete |
| No localStorage/sessionStorage | README:39 | UI settings and started flag do use storage; key material is not stored | tests/e2e/key-gate.spec.ts; tests/key-gate.test.ts | CONTRADICTED wording; narrow to no key persistence |
| SQLite opted-in task records, seven-day expiry | README:41 | server/store.ts:24; shared/model.ts | tests/engine.test.ts | LIVE for task progress only, not full provenance memory |
| One inference per session | README:42 | engine.agentCall separate imageController | tests/engine.test.ts; tests/camera-conversation.test.ts | CONTRADICTED as universal rule: image overlaps limited converse/transcribe |
| 100 dispatch allowance, not dollar cap | README:42 | engine.MAX_SESSION_CALLS:76; admission logic | tests/engine.test.ts; tests/http.test.ts | LIVE allowance; cost governor is PLANNED |
| No automatic paid retries | README:42 | ordinary inference fails visibly; ASR has bounded reconnect/session handling | tests/asr-provider.test.ts; tests/engine.test.ts | LIVE ordinary-call policy; qualify ASR reconnect exception |
| Four pending image follow-ups, one deferred other follow-up | README:90-97 | CompanionHome follow-up queues | tests/camera-conversation.test.ts; tests/e2e/camera-followup.spec.ts | LIVE bounded UI paths |
| Reset clears conversation/images/key/allowance | README:103-105 | engine.resetCallSession | tests/engine.test.ts; tests/http.test.ts | LIVE |
| Diagnostics: 500 events in each of three buffers | README:116-119 | shared/diagnostics.ts; server/diagnostics.ts; src/diagnostics.ts | tests/diagnostics.test.ts; tests/voice-diagnostics.test.ts | LIVE bounded metadata, not full transcript logs |
| Optional voice diagnostics | README:78-80 | shared/voice-diagnostics.ts; CompanionHome | tests/voice-diagnostics.test.ts | LIVE metadata only |
| Jitless Zod, WASM-only ONNX, production CSP | README:135-142 | src/schema-config.ts; vite.config.ts; server/app.ts | tests/e2e/production-csp.spec.ts | LIVE configured/fixture-tested; not an eligibility ruling |
| Node 24, npm commands | README:9,47-53 | package.json engines/scripts | tests/production-server.test.ts; CI workflow | LIVE commands; clean macOS/Linux machine not yet verified |
| No-key replay available from welcome | README:9 vs23 | /api/demo and workspace remain; no current home entry | tests/e2e/conversation-ui.spec.ts explicitly expects no demo | CONTRADICTED discoverability; must expose explicit labelled entry or omit quickstart claim |
| Public production hosting | README:60-62 | runtime-config, render.yaml, health route | tests/runtime-config.test.ts; tests/production-server.test.ts | PREPARED, not deployed; temporary laptop tunnel is not production |
| Exact test totals / performance guarantees | User supplied counts; design Section 5 targets | Tests exist, targets are not measurements | User must supply final command summary | [NEEDS EVIDENCE: current output]; publish no count or achieved latency |
| Full observed/user-reported/inferred/source/model-general memory | Design Sections 3-4 | shared/model.ts Step only pending/user-reported; Feedback has evidenceId; no full EvidenceItem store | Existing engine tests do not establish full schema | PLANNED, not shipped; retain as core design, never sell as complete runtime |
| Salt example factual recall | Design worked example | Model prompt/evidence may support uncertainty; no durable ingredient ledger found | No held-out live salt receipt | FIXTURE-ONLY acceptance example until recorded live |
| Priority Speech Arbiter, dedupe and proactive cooldown targets | Design Sections 3-4 | Queue, cancellation and local routing exist; full proposed priority policy not found | Speech/queue tests do not establish complete design | PLANNED full arbiter; basic playback/interruption implemented |
| Pose behind an explicit off switch | Design Section 4 | useVisualAwareness initially starts whenever camera active | tests/visual-events.test.ts; tests/e2e/vision.spec.ts | CONTRADICTED before submission profile fix |
| PostgreSQL, managed auth, continuous object registry | Design; not current README shipped claims | In-memory sessions, SQLite, clip-local motion only | No shipped-path tests | PLANNED |
| Partner credits not used by submission | Design Section 7 | LiveKit normal profile is external TTS; comparison supports partners | No billing/account statement proves credit use | Submission must disable these; never claim credits were not spent across all historical testing |

## Scope verdicts

| Component | Decision | Why | What breaks if deleted |
| --- | --- | --- | --- |
| LiveKit Inference TTS | QUARANTINE in regular experimental profile; disable in explicit submission profile | Approved speech-only browser scope | Cloud voice quality and TTS tests; tts-kokoro gateway imports it |
| Kokoro | QUARANTINE; disable submission startup/download | Local non-Meta speech model; not approved submission path | Optional offline voice, preparation pipeline and voice tests |
| /livekit | QUARANTINE with comparison label and disable in submission | Voice-only separate agent has different context/tools/key | Comparison UI, token/worker tests |
| Muse Image look previews | REMOVE from judge-facing core flow; retain experimental docs/code | Meta API integration, but outfit/makeup distracts from one cooking flow | Camera image-edit tool, refinement flow and tests |
| Realtime Meta ASR | KEEP conditionally | Real adapter plus tests; design planned it; now implemented | Hands-free streamed input; require live receipt before demo claim |
| SAM | KEEP as optional runtime capability, not required hero demo | Real adapter plus tests; need access/quality receipt | User-requested motion analysis; do not fabricate performance |
| Provenance | KEEP as core concept and honest acceptance example | Canonical design; implementation incomplete | Claiming complete memory would misrepresent runtime |

## Reproduce searches without printing secret contents

Run from repository root. These list matching tracked files, not secret values:

```bash
git grep -Il -i -E 'LiveKit|Kokoro|OpenAI|Gemini|Google|mock|scripted|TODO' -- README.md docs src server shared scripts tests
git grep -Il -F -e 'C:\' -e '../' -e 'localhost' -e '127.0.0.1' -- README.md docs
git grep -Il -i -E 'sk-[A-Za-z0-9_-]{16,}|(api[_-]?key|api[_-]?secret|bearer)[[:space:]]*[:=]' -- .
git check-ignore .env.local .env .data/
```

API-pattern matches include schema fields, examples and fixtures. Inspect privately; never paste raw matches. Local setup addresses and parent-relative Markdown links are valid and must not be blindly removed. Machine-specific absolute paths are residue. Full-history checks are in the final checklist.

## Evidence to collect in under ten minutes per item

- Exact track: copy portal dropdown label, under one minute.
- Test total: run `npm test`, paste only final summary and commit SHA; runtime varies, stop at ten minutes and mark incomplete. Browser suite has its own output, never add file counts to test counts.
- Spark/ASR: one short live question, retain selected-model ID and provider receipt privately. If absent after ten minutes, keep unverified.
- SAM: enable analysis, request a new clip, move a mouse when recording starts. Record result plus account receipt. A UI response alone does not establish confidence fields.
- Demo/live URLs: paste public URLs, check in a signed-out browser. Temporary tunnels expire.
- Metrics not exposed by current diagnostics: use provider dashboard/export; do not enable raw request logging to obtain them. Mark unavailable if no dashboard access.

## Post-audit fixes and entrant evidence

Explicit submission profile added after the initial audit. Browser speech is forced; external TTS/comparison agent and pose are disabled. A labelled no-key replay entry now reaches the existing organizer flow. Automatic recorded-audio recovery is blocked in this profile with a visible retry/text message; regular-profile recovery remains. The entrant supplied track track: Indie Developer; theme: Build for Your World and 355 passing unit/integration tests. Initial browser result was 73 passed, 2 failed; after targeted repairs the complete rerun passed. See TEST_EVIDENCE.md for the scoped receipt. No real-model receipt or public video has been supplied.
