# Glint next milestones

Architecture roadmap: [real-time multimodal task companion](docs/GLINT_REALTIME_ARCHITECTURE_PLAN.md). This proposed roadmap supersedes older recommendations where they conflict; implementation and live qualification remain separate gates.

## Reviewable local slice

- [x] Rolling frame-sequence camera awareness, activity context, proactive change responses and local pose-event tracking; real-user action accuracy remains unqualified.


- [x] Companion-first home, immediate camera, optional single-link Muse research and hands-free Muse transcription with local endpointing and streamed phrase playback. Provider adapters are fixture-tested; live verification remains pending.

- [x] Standalone React/TypeScript UI with original SVG spark, responsive layout and reduced motion.
- [x] Clearly labeled no-key replay and user-supplied text/manual URL provenance flow.
- [x] Exact source confirmation and dependency-aware user-reported progress, including alternate demo side-panel order and cascading undo.
- [x] Explicit camera start/pause/stop, visibility/disconnect handling, local quality worker and byte/age/count bounded frame buffer.
- [x] One-image Check now adapter, server-side freshness/revision/epoch validation, one in-flight job, no paid retries, and dispatch allowance.
- [x] Memory-only BYOK with documented Meta model-list validation, expiry/disconnect, sanitized errors and allowlisted destination.
- [x] Optional local seven-day progress persistence; no image, key or chat persistence.

## Required before public production

- [ ] Confirm exact first manufacturer product/manual and a held-out, independently annotated task dataset.
- [ ] Test the actual user-selected provider/model using a key entered in the app. Record accuracy, response-time distributions, billing units/estimates, actual image access and rate limits. Do not treat model-list success as image capability verification.
- [ ] Meet p95 end-to-end guidance-age and task-specific missed-error/false-correction thresholds, or explicitly retain checkpoint scope. Existing 18.2-second user report does not meet proactive correction targets.
- [ ] Replace local capability sessions with managed account auth, audited ownership policies, PostgreSQL task state, multi-instance leases and tested key reentry/failover.
- [ ] Live-verify Muse search against authoritative manuals and evaluate provenance. Add isolated manual extraction only if needed, with SSRF/DNS/redirect/size/MIME safeguards. Never fetch arbitrary user URLs through unrestricted server networking.
- [ ] Implement and evaluate ordered temporal evidence; the current ring stores stills locally and uploads only one selected image on request. Significant event retention/gaps must be explicit before proactive analysis.
- [ ] Evaluate LiveKit/MediaPipe/Docling/Supabase/Rive only for demonstrated needs. They are candidates, not integrated services. Modal/Baseten/Fireworks access remains pending.
- [ ] Live-verify hands-free voice and streamed replies, review privacy/retention, and measure echo handling, interruption accuracy and latency on real devices. Native speech-to-speech transport is not implemented.
- [ ] Define service funding, provider cost display, reservation/reconciliation and app quotas; a user model key does not pay for hosting/search/storage/voice/GPU.
- [ ] Conduct 60/90-minute real-phone foreground soaks, thermal/battery/bandwidth/memory/queue tests and 1/5/20-session load qualification.
- [ ] Complete public HTTPS/proxy configuration, security/secret scans, malicious-document and cross-user testing, retention/deletion review, consent, and operational support.
- [ ] Set deployment date/team scope after evidence. No current production-readiness or unrestricted task coverage claim.
