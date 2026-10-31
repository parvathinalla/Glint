# Voice goal report (DRAFT): Glint vs Gemini Live

Objective: surpass Google Gemini Live on voice interaction across
turn-taking in noise, interruption handling, voice consistency, and
speaker lock. Status: all four phases implemented and green in automated
gates; phone verification pending. This draft records lab-measured
numbers; phone cells are marked PENDING until a human run fills them.

## Lab gates (observed, this worktree)

- Unit/integration: 223 passing; 8 HTTP checks pass port-allowed
  (sandbox denies binds with EACCES).
- Browser e2e: 36/36 on isolated port 3101 (system Chrome).
- `tsc --noEmit` clean, `eslint` clean, `vite build` clean.
- Real-model tests: Silero VAD, WeSpeaker, Kitten + Kokoro TTS (committed).

## Phase 1 — turn-taking in background noise

| Metric | Glint (measured) | Gemini Live (reported) |
|---|---|---|
| VAD | Silero v6 neural OR-fused with adaptive energy (noise floor 5 s, 4x) | Neural (undisclosed) |
| Quiet speech in noise | Heard with ML on, silence with ML off (e2e, JFK clip) | No user-visible status |
| VAD status | Visible note + plain-WASM fallback; `glint-ml-vad=0` kill switch | None |
| Endpointing | 500 ms streaming / 850 ms WAV, semantic extend/early-end | Semantic (undisclosed) |
| Noisy-room phone check | PENDING | — |

Surpasses on: audible-proof-in-noise e2e, visible degradation status,
kill switch. No committed competitor beats a visible VAD state because
none exposes one.

## Phase 2 — interruption and false-trigger resume

| Metric | Glint (measured) | Reported |
|---|---|---|
| Speech-start to local stop | ~100 ms design target (span-instrumented) | GPT-Live 240 ms, Gemini 320 ms end-to-end (Full-Duplex-Bench-v3, via AI CERTs); Gemini speaker-switch 1,260 ms (PersonaPlex bench) |
| False-trigger resume | Soft-stop + resume proven by 5 e2e (echo, dropped burst, empty transcript, stranger barge, neural-audio barge) | Low mistaken-interruption rates (GPT-Live 13.5% Full-Duplex-Bench-v3); vendor self-reports only |
| Barge server invalidation | 300 ms confirmation; pops never abort work | Undisclosed |

Surpasses on: proven resume-after-false-trigger matrix (vendors publish
rates, not reproducible behaviors). Raw barge latency is competitive;
human-feel confirmation is PENDING on phone.

## Phase 3 — one consistent streaming voice

| Metric | Glint (measured) | Reported |
|---|---|---|
| Voice | Kitten Nano v0.2 fp16 (sherpa), 24 kHz, identical on all devices; Kokoro int8 fallback | Gemini: limited voice selection (inworld 2026 table) |
| Synth speed | RTF ~0.24 laptop CPU (74 ch in 1.2 s; 10x faster than Kokoro's 12 s on the same phone run); non-blocking async | Native S2S streams sub-chunk (no sentence floor) |
| First audio | After first sentence synths (~0.7 s typical opener + LLM time to that sentence) | Gemini Live ~400–600 ms API / ~1–3 s product; GPT-4o 232–320 ms (OpenAI) |
| Failure mode | Per-sentence device-speech fallback; never silent; `glint-neural-voice=0` | Undisclosed |
| Voice quality phone check | PENDING (human ear) | — |

Surpasses on: cross-device consistency (one voice, not per-device
robot), offline/no-per-call-cost, graceful fallback. Does NOT yet match
native speech-to-speech first-audio latency: the sentence-synth floor
(RTF 0.24) plus LLM time-to-first-sentence is ~1 s plus LLM time,
not ~300 ms. KittenTTS Nano (the planned 3–5x probe) shipped as the
default voice after measuring 10x on the failing phone sentences.
Documented follow-ups: short-opener prompting, cloud TTS fallback.

## Phase 4 — speaker lock

| Metric | Glint (measured) | Reported |
|---|---|---|
| Owner verification | WeSpeaker ResNet34-LM on-device, cosine ≥ 0.32; owner clean 0.67–0.77, strangers ≤ 0.25 | Neither Gemini Live nor ChatGPT Voice offers voice lock (OpenAI help center: multi-speaker not optimized) |
| Second-person phone check | PENDING | — |
| Limits | No liveness (recordings verify), single owner, ~5 dB white-noise floor | — |

Surpasses outright: the category leaders have no owner-only mode at all.

## End-to-end latency honesty

Glint is a streaming cascade (VAD → ASR → LLM → sentence TTS). Typical
lab spans: transcribe 0.6–2 s, converse 1.6–5 s full (first token much
earlier), first audio after first-sentence synth. That is a multi-second
first-audio budget — competitive with cascaded products, not with native
speech-to-speech (~300 ms). The surpass claim rests on robustness
dimensions (noise proof, visible status, resume matrix, speaker lock,
consistency, offline, cost), not raw speed. Closing the speed gap needs
either a sub-sentence streaming synth (Kitten/ZipVoice probe) or a
native audio model; both are scoped, neither is started.

## Phone verification protocol (human, ~15 min)

1. Restart the server (`npm start`), reload the phone page.
2. Noise: stand near TV/fan, speak normally; record whether Glint
   answers, the exact VAD status line, and phone model/browser.
3. Second person: enroll voice (2×4 s), have someone else speak;
   record owner-answered / stranger-ignored / stranger-barge-resumes.
4. Voice: hold a 3-turn conversation; record naturalness (1–5),
   speech starting while text streams (y/n), barge crispness (1–5).
5. Paste results back; they fill the PENDING cells and close the goal.

## Sources

- PersonaPlex bench via kunalganglani.com (Gemini speaker-switch
  1,260 ms); pasqualepillitteri.it (Full-Duplex-Bench table).
- tau-Voice via evalgent.com (0.90–1.15 s latency scores).
- inworld.ai speech-to-speech table, May 2026 (Gemini ~400–600 ms).
- OpenAI via aiwiki.ai / voicebridge (GPT-4o 232/320 ms).
- AI CERTs News (Full-Duplex-Bench-v3 interruption rates).
- tech-insider.org 2026 comparison (undisclosed Gemini API latency).
- OpenAI Help Center (ChatGPT multi-speaker limits, via prior note).
