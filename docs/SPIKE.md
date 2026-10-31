# Stage 0 spike: baseline timing + provider contracts

Date: 2026-10-28. Task 0 output. No production behavior changes in this task:
only timing instrumentation (`shared/timing.ts`, hooks in `src/`, spans in
`server/engine.ts`) plus this report.

## Part A — measured baseline (real device + real key)

Status: **not measured yet.** The human runs the procedure below; every cell
stays "not measured" until a real-device run fills it.

### Targets (design doc Section 5, "Glint_ Design Document.docx")

| Span | Target |
|---|---|
| User speech onset → local playback stop (barge-in) | p95 ≤ 100 ms on qualified devices, from annotated onset; release blocker |
| End of utterance → first meaningful spoken answer | p50 ≤ 1 s; p95 ≤ 2 s (simple grounded questions) |
| Visible action change → correct contextual response | p95 ≤ 3 s on qualified activity set (fast path) |
| Stable gesture meets criteria → local detection | p95 ≤ 500 ms |
| Quality gates (precision/recall, ≤1 unsolicited correction per 30 min, ≥95% supported claims, 60-min stability) | Section 5 table; separate from latency |

### Baseline table template

| Span | Target | Measured p50 | Measured p95 | Source log |
|---|---|---|---|---|
| Voice: capture start → ASR final | — (diagnostic) | not measured | not measured | `kind:voice-turn` browser console |
| Voice: ASR final → model first token | — (diagnostic) | not measured | not measured | same |
| Voice: first token → playback start | — (diagnostic) | not measured | not measured | same |
| Voice: capture start → playback start | ≈ end-of-utterance → first answer (p50 ≤ 1 s, p95 ≤ 2 s) | not measured | not measured | same |
| Barge-in: speech onset → playback stop | p95 ≤ 100 ms | not measured | not measured | NOT YET INSTRUMENTED, see gap 1 |
| Observation: client submit → return | — (diagnostic) | not measured | not measured | `kind:observation` browser console |
| Server: converse span | — (diagnostic) | not measured | not measured | `scope:server,lane:converse` server stdout |
| Server: observe span | — (diagnostic) | not measured | not measured | `scope:server,lane:observe` server stdout |
| Server: transcribe span | — (diagnostic) | not measured | not measured | `scope:server,lane:transcribe` server stdout |

### How the log lines map to spans

- Browser console `[glint-timing] {"kind":"voice-turn","capturedStartMs":…,"asrFinalMs":…,"modelFirstTokenMs":…,"playbackStartMs":…}`:
  `capturedStartMs` = local turn-start signal (`VoiceTurnDetector` `{started}`
  via `useMicrophone.onSpeechStart`); `asrFinalMs` = `POST /api/voice` return;
  `modelFirstTokenMs` = first `streamAgent` SSE delta; `playbackStartMs` =
  first `SpeechQueue` → `speechSynthesis.speak` call. Feed the record to
  `voiceTurnDurations()` for the four spans.
- Browser console `[glint-timing] {"kind":"observation","submitMs":…,"returnMs":…,"frameCount":…}`:
  client round-trip of one `POST /api/observe` in `observationTick`.
- Server stdout `[glint-timing] {"scope":"server","lane":…,"ms":…}`: successful
  `Engine.agentCall` spans only (failures throw before the mark).
- All records are numbers-only; `logTiming` drops anything carrying transcript,
  frame, URL, or key content (`tests/timing.test.ts`).

### Run procedure (human, ~10 scripted trials per Section 5 evidence pack)

1. Real phone on a defined network profile, production server build, real key
   connected in-app. Open remote devtools; preserve browser console.
2. Run ~10 trials of the demo task: camera on, one spoken question per trial
   ("did I already add the salt?" moment included), plus idle observation time.
3. Copy all `[glint-timing]` lines from the browser console and server stdout.
4. Compute p50/p95 per span; fill the table; keep the raw lines with the report.
5. Approximation notes (do not over-claim): `capturedStartMs` is turn-start
   detection (onset + ~160 ms candidate + pre-roll), not annotated onset;
   `asrFinalMs` includes the end-of-silence wait (500 ms streaming, 850 ms WAV) plus upload;
   `playbackStartMs` is first-phrase `speak()` dispatch, not audible sound.

### Instrumentation gaps for later tasks

1. Barge-in span (speech onset → local playback stop, the 100 ms release
   blocker) has no marks yet: Task A must timestamp local detection and the
   `SpeechQueue.cancel()` path.
2. Observation failures/aborts log no timing (success path only).
3. Server error spans are not logged (success path only).
4. No gesture-detection marks (pose worker) against the 500 ms target.

## Part B — verified provider contracts (official docs only)

Inspected 2026-10-28. Every claim below cites the official page it came from.
Anything not on an official page is in the "unknown" lists, never guessed.

### B1. Muse Voice Transcribe realtime — VERIFIED, sufficient for Task A

Sources: [Speech to text](https://dev.meta.ai/docs/speech-to-text),
[Transcribe in realtime](https://dev.meta.ai/docs/api-reference/voice/realtime),
[Pricing and rate limits](https://dev.meta.ai/docs/pricing-rate-limits).

- Endpoint: `wss://api.meta.ai/v1/asr/realtime?sessionId=<id>`; `sessionId`
  optional, server generates one and returns it in the handshake acknowledgement.
- Model id: `muse-voice-transcribe-1.0`.
- Auth: credential travels in the handshake frame only:
  `authorization.accessToken` = `Bearer <key>`. The HTTP `Authorization`
  header and API-key query parameters are ignored. Handshake is the first JSON
  text frame, within 10 s of connecting.
- Handshake acknowledgement `{sessionId}` has NO `type` field; every later
  server JSON frame has a `type`. Wait for the ack before sending audio.
- Audio: binary frames, raw PCM signed 16-bit little-endian mono. `PCM_24KHZ`
  (48,000 bytes/s, engine-native, preferred) or `PCM_16KHZ` (32,000 bytes/s,
  server resamples). No container, timestamps, or sequence numbers; frame
  boundaries carry no meaning. Pace at ~real time; keep sending PCM silence
  during silence; never run more than 5 s ahead of processing.
- Modes (fixed per session once started): `PUSH_TO_TALK` (default, you delimit
  the turn), `ENDPOINTING` (model finds turn edges, low-latency voice use),
  `DIARIZATION` (adds `speaker` events; NOT tuned for low-latency use).
- Completion signals: `PUSH_TO_TALK` → `transcript` event with `final: true`;
  `ENDPOINTING`/`DIARIZATION` → `speechComplete` event per `turnId`.
- Partials: interim `transcript` events. `CUMULATIVE` (default) = each event is
  the complete current hypothesis: REPLACE the previous partial, never append;
  a partial can revise or remove earlier text. `DELTA` is for file-transcribe
  SSE only. Partials carry no `turnId`; a `transcript` belongs to the turn
  opened by the most recent `speechStart`.
- `speaker` events label the audio BEHIND them (previous `speechStart`/`speaker`
  to this event); exactly one per turn; not a boundary or final signal.
- `audioProgress` events with `audioProcessedMs` arrive when `emitAudioProgress`
  is on (default); treat as processing progress, not word timing.
- End of input: drain the outbound queue, send `{"type":"endStream"}`, send
  nothing more (half-closes client→server), keep reading until the server
  closes with `1000`. Closing the socket also ends input but can drop pending
  events. End of speech does NOT end the session.
- Errors: before a fatal close the server sends
  `{"type":"error","message","sessionId"}` when the connection permits; use the
  close code to decide retry vs fix.
- Session lifetime: max 60 minutes default; NO resume token — a new WebSocket
  is a new session, join transcripts app-side. Server reaps (checked 1/s):
  handshake deadline, session length, backlog, pacing, idle input (audio stops
  without `endStream`), idle output (stall after end-of-input).
- Rate limits (per tenant, shared across both endpoints): 256 concurrent
  streams, 16,000 streams/hour. Rejected realtime closes with `1013`; rejected
  file transcribe returns `429`. Back off before retrying.
- File endpoint (current Glint path, unchanged): `POST /v1/asr/transcribe`,
  multipart `request` JSON + `audio` WAV (mono 16-bit PCM, 16 or 24 kHz),
  ≤10 minutes; JSON returns `transcript`, `audioDurationMs`, `turns[]`
  (`turnId`, `startMs`, `endMs`, `transcript`, `speaker` in DIARIZATION).
- Pricing: $0.18/hour of audio actually processed, rounded DOWN to whole
  seconds; streaming and non-streaming priced the same; ZDR at parity;
  pre-transcript failures and 429s not billed.
- Hard limits of the model: turn-level timestamps only — no word timestamps,
  confidence scores, sound-event or emotion detection, or reformatting.

Unknown (ASR, undocumented on the pages above — check before relying on any):

1. Full close-code list beyond `1000` (normal) and `1013` (rate-limited).
2. The 9 handshake field names/types/defaults in full (seen: `authorization`,
   `model`, `mode`, `audioEncoding`, `partialMode`, `emitAudioProgress`,
   `languageBias`, `keywords`; 9th field and defaults need
   `/docs/api-reference/voice/schemas`).
3. Exact idle-input/idle-output timeout durations.
4. Any server-side latency figures (time to first partial).
5. Whether one WebSocket can carry multiple sequential turns in `ENDPOINTING`
   mode within the 60-minute session (implied yes by "one turn per detected
   speech segment" + `speechComplete` per `turnId`, but no explicit multi-turn
   session example was read).

### B2. SAM 3.1 — VERIFIED, sufficient for Task B design

Sources: [Media segmentation](https://dev.meta.ai/docs/media-segmentation),
[Segmenting with prompts](https://dev.meta.ai/docs/sam/segmenting),
[Reading segmentation output](https://dev.meta.ai/docs/sam/reading-segmentation),
[Pricing and rate limits](https://dev.meta.ai/docs/pricing-rate-limits).

- Model `sam-3.1`, served over the Responses API (`POST /v1/responses`, same
  Bearer auth and host as the existing `AgentProvider`). `stream: true` is the
  recommended path, especially for video.
- Official pairing matches the design doc: Muse Spark interprets the scene and
  picks the concept; SAM 3.1 returns geometry (boxes + pixel masks). SAM does
  not caption, answer, or reason.
- Request shape: one user message = `input_text` prompt + media part:
  `input_image` (`image_url`: public URL or base64 data URL) or `input_video`
  (`video_url`, or `file_id` from `POST /v1/files` with `purpose=user_data`;
  upload is synchronous, `200` = ready for the next request).
- Concept prompt: short noun phrase naming ONE concrete object
  ("delivery van"). One concept per request: comma/and/newline lists return
  zero matches or segment only one concept; send one request per concept.
  Commands/questions ("segment the bus") are unreliable.
- Box/point prompts: same `input_text` part, same token grammar as output;
  `<Nf>` frame marker (images: `<0f>` only), comma-separated objects each with
  a caller-chosen id reported back in the response; at most one box per object
  per frame; `-` prefix = negative point (points only); every token carries
  `w`/`h` = media's own pixels after rotation; aspect mismatch → `400`.
  Helpers `buildObjectPrompt` / `build_object_prompt` exist (client-libraries
  page, not read in full).
- Output: single `output_text` lane, one line per frame, each line in its own
  `response.output_text.delta`; stream ends at `response.completed`. Zero
  matches = empty `output_text` + `completed`: a NORMAL result, not an error.
- Line grammar: `<Nf>id<|box;x1=..;y1=..;x2=..;y2=..;w=<frameW>;h=<frameH>[;c=<conf>]|><|mask;x=0;y=0[;c=<conf>];data=<H>,<W>,<enc>payload|>,…`
  Every record = exactly one box + one mask, box first. Box `x2`/`y2`
  INCLUSIVE. Mask payload is base85 (NOT base64; may contain `~`, `!`).
  Confidence `c` (0–1) appears only when the request sets
  `metadata.include_confidence` to the STRING `"true"` (JSON boolean rejected);
  box and mask of one record share the value; values vary per frame.
- Frame markers: zero-based but NOT contiguous or ascending — frames with no
  visible object emit NO line; never assume line N = source frame N. Concept
  prompts return ascending order; box/point prompts follow tracking direction
  (`forward`/`backward`/`both`, default `both`: forward frames first, then
  backward descending). Single image = frame `<0f>`.
- Object ids: stable across frames WITHIN one response; sparse, not dense
  0-based (a line can carry `0, 2`); key masks by id, never by position. Do
  NOT rely on id stability across entry/exit/full occlusion/very long clips.
- Limits: clip ≤ 15,000 frames (~10 min) per request; video tracks ≤ 16
  objects/frame; ≤ 16 prompted objects (17th → `400 invalid prompt`); image
  requests return every matching instance.
- Billing: images $2.50/1,000; video $0.20/1,000 frames with a 50-frame minimum
  per request; `usage.video_frames_processed` reports billed frames; streaming
  priced same as non-streaming. Glint's 1–3 s / 6–10 fps clips fit easily but
  each request bills ≥50 frames.
- Rate limits: per-team table lists `sam-3.1` at "3,000" (dimension ambiguous
  on the page read — see unknown 3).

Unknown (SAM, undocumented on the pages above):

1. How to send a few discrete JPEG frames as `input_video` (encoded container
   required? `video_url` data-URL format for clips?) — Task B's key open
   question; check `/docs/video-understanding` and `/docs/file-handling`.
2. Input resolution caps and upload byte caps for images/video.
3. Rate-limit dimensions for the `sam-3.1` "3,000" figure (requests/min?).
4. Any latency figures (per image / per frame / per clip).
5. Mask payload bit-packing beyond "base85, H rows × W cols" (check
   `/docs/sam/client-libraries` parser before hand-rolling a decoder).
6. Full error schema beyond the invalid-prompt/`400` examples.

### B3. Consequences for Tasks A and B

- Task A precondition MET: the realtime contract above is verified from
  official docs. Recommended Glint settings: `ENDPOINTING` mode (low-latency
  turns), `PCM_24KHZ` (matches the current 24 kHz capture path), CUMULATIVE
  partials as replacements, finalize on `speechComplete` per `turnId`,
  `endStream` + read-to-`1000` on turn end, reconnect-before-60-min with
  app-side transcript join, `1013` → backoff. Keep WAV file-transcribe as the
  labeled fallback (contract re-verified above).
- Task B precondition MET for design, with unknown 1 gating the clip-encoding
  choice: resolve how `input_video` accepts short frame sequences before
  writing the adapter. Parser must implement the line grammar above (base85,
  inclusive boxes, sparse ids, skipped frames); zero matches is normal.
- Cost-governor inputs now grounded: ASR $0.18/hr whole-second; SAM video
  $0.20/1K frames min-50, images $2.50/1K; no published token billing for
  either (audio/frames are separate line items).

## Part C — ML VAD evaluation (Silero, IMPLEMENTED same day)

Date: 2026-10-30. Interruption-parity track: energy VAD stays, with a local
neural VAD as the next slice. Implemented below this line; see
IMPLEMENTATION.md for the shipped summary.

Candidate: Silero VAD v6 ONNX (~2.3 MB, MIT), same I/O as v5: 512-sample
frames at 16 kHz plus a [2,1,128] state tensor, each frame prefixed with the
last 64 samples of the previous one. Runtime: onnxruntime-web (WASM),
~0.4 ms inference per 32 ms chunk on CPU — negligible next to the 42.7 ms
detector frame. The `@ricky0123/vad-web` wrapper packages model + runtime if
vendoring by hand is unwanted.

Fit: detection runs on the main thread today (the AudioWorklet only posts
1024-sample @24 kHz frames), so inference slots into the existing message
handler — no worklet threading pain. The handler would resample 24→16 kHz,
accumulate 512-sample windows, and fuse ML probability with the energy
threshold (ML-first, energy fallback when the model fails to load, mirroring
the streaming→WAV fallback discipline). Model vendoring mirrors the vision
precedent: pinned file under `public/` with a hash check at build time.
Production CSP already permits WebAssembly compilation.

What it buys: neural rejection of pops, clicks, keyboard, steady noise, and
music that clear an energy threshold — fewer false barge-ins and more
reliable turn starts in noisy rooms. What it does NOT buy: echo rejection
(echo is real speech acoustically — still needs the barge guard + transcript
verdict) or speaker identification (still nobody's feature, ChatGPT included).

Costs/risks: onnxruntime-web adds ~10 MB of lazily-loaded WASM assets (needs
Vite asset config + lazy import to keep the main bundle lean); first
inference needs a warm-up at mic start (~100–300 ms, inside existing mic
setup); stateful model must reset per voice session. Effort: medium, about
one session including tests. Awaiting user go-ahead before adding the
dependency.

## Part D -- speaker verification evaluation (WeSpeaker, IMPLEMENTED same day)

Date: 2026-10-30. Speaker-lock track: every voice turn is verified against an
enrolled owner voiceprint, on-device. Implemented below this line; see
IMPLEMENTATION.md for the shipped summary.

Candidate: WeSpeaker ResNet34-LM ONNX (~25.3 MB, Apache-2.0 weights via the
sherpa-onnx speaker-recognition release), VoxCeleb-trained English, 256-dim
embeddings from 80-bin Kaldi fbank. ERes2Net (same release, same size)
separated slightly worse on the release's own three-speaker test clips
(cross max 0.305 vs 0.248) and no better in white noise, so ResNet34-LM won
on the stranger ceiling, which is the false-accept direction that matters.

Frontend: the model needs Kaldi fbank (25 ms Povey window, 10 ms shift, 80
mel bins) PLUS per-utterance mean normalization. Validated as required:
without CMN, same-speaker (0.49) and cross-speaker (0.50) overlap; with CMN,
same 0.67-0.77 vs cross <= 0.25. Voiced-only frame selection was tested as a
noise-robustness help and disproven (identical or worse), so full-turn audio
is embedded. Implementation is dependency-free (radix-2 FFT plus triangular
mel banks).

Thresholds (resnet34-LM + CMN, single-thread WASM): owner clean 0.67-0.77,
owner at 10 dB white noise 0.38, owner at 5 dB 0.32 (at the threshold),
strangers <= 0.25 clean or noisy, white noise 0.20, sine -0.02. Reject below
0.32: every measured stranger rejected with margin, owner allowed down to
about 7 dB white noise (a pessimistic floor; VoxCeleb training covers real
room noise better). Short turns (under 0.8 s voiced) bypass the check:
backchannels must never be blocked, and sub-second embeddings are
unreliable.

Fit: inference runs about 750 ms per 5 s of audio (desktop single-thread
WASM; phones several times slower), far too slow to gate turns synchronously,
so verification runs ASIDE transcription and a stranger verdict kills the turn
mid-flight (before the first reply token the interrupted speech is still
preserved and resumes like any false trigger). Enrollment averages two 4 s
samples (averaging measurably rescues noisy scores); an inaudible-sample
guard refuses to mint a voiceprint from silence. Everything uncertain fails
open; only confident strangers fail closed.

What it buys: TV speech, nearby conversations, and other people can no longer
drive turns or hold Glint's attention; false barge-ins resume instead of
derailing. What it does NOT buy: diarization (one enrolled owner, not
per-speaker labels), liveness/anti-spoofing (a recording of the owner
verifies), or far-field reliability (scores degrade with distance and
reverberation like any embedding).

Costs/risks: +25 MB vendored weights (served from /speaker/, cached after
first load) plus per-turn embedding compute on phones (async, off the reply
path); the shared ONNX Runtime WASM build serves both VAD and speaker models.
Owner false-rejects in severe noise remain possible below about 5 dB white
noise, where ASR is unusable anyway; the kill switch is
localStorage glint-speaker-lock=0.

## Part E -- neural TTS evaluation (Kokoro via sherpa-onnx, IMPLEMENTED same day)

Date: 2026-10-30. Streaming-voice track: one consistent natural Glint voice
replaces per-device robot speech. Implemented below this line; see
IMPLEMENTATION.md for the shipped summary.

Rejected first: kokoro-js (Transformers.js + ONNX Runtime WASM) loads the 86
MB q8 model in Node but its espeak-ng phonemizer WASM aborts the process on
the first generate (minified emscripten crash, exit 7, kokoro-js 1.2.1, Node
24). Running it in the browser instead would distribute GPL code to clients,
so it is out on both robustness and licensing.

Winner: sherpa-onnx-node 2.0.1 (prebuilt native binding, Apache-2.0) with the
Kokoro int8 multi-lang v1.0 pack (model 109 MB, voices 27 MB, lexicon 6 MB,
Apache-2.0 weights). Measured on this laptop CPU: 1.8 s load, RTF ~1.0 per
sentence (2 threads; 4/8 threads no faster), 24 kHz output, healthy levels
(peak ~0.3, RMS ~0.06), ~420 MB RSS hot. Synthesis is lexicon-only, so no
espeak/GPL bytes ship anywhere. generateAsync keeps the event loop free, but
its progress callback fires once per sentence (no intra-sentence chunks), so
streaming is sentence-pipelined: the LLM stream splits into sentences, each
synths FIFO while later text arrives, and audio plays gaplessly. First audio
lands after the first sentence synths (~2-4 s for a typical opener, plus LLM
time to that sentence); short openers and the boot warmup keep it tight.

Deferred, not rejected: KittenTTS Nano (25 MB) would likely synth 3-5x
faster, but sherpa's Kitten needs the 122-file espeak-ng-data tree and its
quality is unprobed; the GlintVoice provider interface keeps the model
swappable for that follow-up. Cloud TTS stays the latency fallback if local
RTF ever blocks parity.

What it buys: every device hears the same natural voice (af_heart), replies
start speaking while text still streams, and any synth/decode failure falls
back to device speech per sentence instead of going silent. What it does NOT
buy: sub-second first audio (whole-sentence RTF 1.0 sets the floor), or
neural speech in text chat (App.tsx unchanged by design).

Post-ship fix (same day, from the first phone run): overlapping
generateAsync calls from barged replies stacked on the CPU-bound native
synth and slowed each other from 3.3 s to 10.6 s per sentence; audio
then arrived generations late and the client's staleness guard dropped
it, which read on the phone as "speaks once, then silent". All requests
now share one FIFO synth lane, so every sentence synths at solo speed.
The same run showed the lexicon silently skipping what's/what'd and any
curly-quote token; the speak cleaner now folds those to ASCII and
expands the seven proven-missing contractions.
