# Glint phased plan

October 27, 2026 · Phased build plan. See [IMPLEMENTATION.md](IMPLEMENTATION.md) and [TEST_REPORT.md](TEST_REPORT.md) for October 28 local-slice evidence.

The full specification is [GLINT_DESIGN.md](GLINT_DESIGN.md). The public-web/BYOK stack, diagrams, and secret lifecycle are in [GLINT_ARCHITECTURE.md](GLINT_ARCHITECTURE.md). Public production use is the goal; deployment and production qualification remain future work.

| Phase | Deliverable | Exit condition |
|---|---|---|
| 0. Select and measure | Choose one low-risk exact product/manual; confirm access and API modalities; benchmark representative images and ordered action evidence | Document exact model/provider, input limits, measured p50/p95 latency, cost units, retention, and baseline errors. No invented endpoints or credit assumptions |
| 1. Confirm instructions | Candidate search, source extraction/provenance, product/version confirmation, reviewed task graph | Wrong/ambiguous manual tests block guidance; each instruction resolves to its approved source |
| 2. Build a checkpoint slice | Public-web shell, auth, session-only BYOK with disclosed validation billing, original lightweight avatar, text conversation, explicit foreground camera permissions/start/pause/stop, Check now | One real end-to-end task; key never persisted or logged; process loss requires reentry; live versus fixture/replay labels; uncertain evidence never becomes verified completion |
| 3. Add temporal observation | Continuous bounded capture, regular sampling, adaptive bursts, pre-event clips, freshness/queue policy, calibrated correction checks | Fast actions, occlusion, valid alternate orders, stale responses, and overflow pass defined task-specific gates; otherwise retain checkpoint scope |
| 4. Add durable sessions and voice | Transactional task state, reconnect/key reentry, separate provider/app budgets and deletion; STT/TTS only after separate spike | No duplicate transitions or replayed stale speech; local barge-in works; credit failures degrade clearly; voice capability and funding verified |
| 5. Qualify and publish | Held-out task dataset, 60/90-minute foreground device soaks, staged concurrency, accessibility, security review/secret scans, funded public hosting | Publish only after measured accuracy, p95 guidance age, queue/memory/device budgets, privacy/key isolation, and cost/concurrency gates pass |

Phases may overlap only where dependencies allow. Use one primary reasoning path with deterministic policy; selective escalation must justify its measured benefit. Add infrastructure only in response to a demonstrated limit. Do not begin a broad task library before the first task is evaluated.

Hackathon stopping point: phases 0–2 plus the smallest passing part of phase 3. Voice and polished motion cannot displace provenance, pause/stop, or evidence integrity. Reserve time for a repeatable demonstration and an honest report. No deadline or team capacity has been agreed, so this is an ordered scope plan, not a completion promise.

First decisions: choose the exact task/manual and target phone; verify Meta latency/modalities and remaining access; select hosting/search/auth/storage vendors; agree provider usage and app-service allowances, funding, key expiry, and retention. BYOK does not pay for search, storage, hosting, separate speech, or optional GPU workers. Baseten/Modal/Fireworks applications remain pending. A reported 18.2-second image description is an early latency warning, not an accuracy result.

For every phase, record test fixtures, model/provider revisions, measured results, known gaps, and fixture/replay/live status. Evaluate camera, voice, and session capabilities against the design's acceptance gates before claiming production readiness.
