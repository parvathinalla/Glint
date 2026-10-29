# Glint design

Design direction · October 27, 2026. Local checkpoint implementation added October 28; see [IMPLEMENTATION.md](IMPLEMENTATION.md) for present capabilities and unverified production work.

## 1. Product and scope

Glint is a camera-based AI coach for everyday procedural work. A person identifies a task, confirms the right instructions, and works while Glint observes, answers questions, and offers brief, evidence-backed corrections. It should feel attentive and warm while clearly identifying itself as AI.

Glint is a standalone public website with bring-your-own model-provider key (BYOK). The initial camera mode is a foreground-active browser session. Public production use is the goal; no website has been deployed or qualified yet. See [GLINT_ARCHITECTURE.md](GLINT_ARCHITECTURE.md) for the architecture images, component responsibilities, and detailed key/session lifecycle.

Production quality means reliable task identification, useful observations, controlled interruption, recoverable sessions, measured performance, and explicit uncertainty. A polished avatar alone does not establish these properties. No Glint accuracy, streaming capability, deployment, or long-session reliability has been demonstrated.

**First evaluation candidate:** reversible, low-risk desk assembly with a published manufacturer manual, visible components, no powered tools, and no load-bearing safety dependence. The user has not chosen the first task or exact product. Cooking is a later domain requiring separate evidence and domain review; appearance alone cannot establish temperature, doneness, allergens, or food safety. Exclude medical procedures, energized electrical work, and other high-consequence tasks from the initial scope.

## 2. Main experience

1. **Describe:** type or say “Help me assemble this desk organizer.” Optionally attach a product label, URL, manual, or photographs. Search can begin from typed input before camera access. Sign in and connect a supported provider key before the first model-funded operation; disclose any validation charge, provider/model, estimated usage, and separate app-service allowance.
2. **Identify:** show candidate product/model/revision and a source preview. Ask focused questions about unresolved differences, including region, parts, or recipe edition. Never silently select a near match.
3. **Confirm:** the user approves a specific task and source version, parts list, relevant warnings, and any unresolved limitations. Changing the source invalidates the plan and requires confirmation again.
4. **Prepare:** request camera/microphone separately, explain cloud analysis and retention, check lighting/framing, and show the work area. Show key lease and budget status. The user explicitly starts the session.
5. **Work:** show one useful next step, its picture/source location, and optional detail. Listen for questions, observe activity, and speak only when useful. Independent steps can occur in a different valid order.
6. **Resolve uncertainty:** ask for a close-up or confirmation instead of upgrading a guess into completion. Offer “Check now,” “I did this off camera,” and undo/correct controls with honest evidence labels.
7. **Pause/resume/finish:** stop capture on pause; preserve confirmed task state. On resume, reacquire permission when needed and reconcile the current scene. Finish shows completed, user-reported, and unverified steps separately, with deletion controls.

Do not force a person through repeated confirmations for ordinary conversation. Confirm identity/version once, then re-confirm only a meaningful change or unresolved consequential fact.

### Interaction storyboard

| Moment | Visible interface | Glint response and rule |
|---|---|---|
| Arrival | Small spark wakes and takes two tiny steps toward the title; task field already usable | “Hi, I’m Glint, your AI task coach. What are we making?” One greeting, no fake human operator |
| Ambiguous model | Two source cards with labels and revision details | “Does your label say A2 or A3? Their brackets differ.” No guidance from the unconfirmed manual |
| Ready | Confirmed source, camera preview, parts tray, Start button | “Let’s keep the base and both side panels in view.” Camera permission does not itself start a session |
| Ordinary progress | Camera dominates; compact current-step card | Quiet observation; no narration of every movement |
| Possible skipped prerequisite | Highlight source diagram, keep preview unobstructed | “I may be missing the washer under that screw. Could you tilt the camera?” Uncertainty is explicit |
| Supported correction | Brief caption and optional spoken cue | “Before tightening, place the washer under the screw head; it spreads the pressure. See step 3.” Requires confirmed manual support and current evidence |
| Valid alternate order | Progress updates to the other eligible branch | “That order works; both panels just need to be fitted before the brace.” No correction solely for differing from page order |
| User interrupts | Speech stops immediately; Listening label | “Wait, I already did that.” Glint reconciles user report with evidence and asks only if needed |
| Connection loss | Persistent Reconnecting label and last confirmed step | Stop presenting cached advice as current; show whether capture has stopped and whether anything is queued |
| Return | Resume panel with source version and last evidence time | “We last confirmed the left panel. Show me where you are now.” No claim of seeing the missing interval |

## 3. Visual and motion specification

An original “small light at your workbench” identity: an asymmetric four-point ivory spark, a small amber center, two tiny feet, and a subtle offset halo. The provisional concept uses warm expressive eyes and a small mouth; a simplified vector treatment should preserve recognition at small sizes. Posture and a slight tilt convey attention. Do not reproduce Muse artwork, proportions, choreography, layout, or branding. The reference informs only the high-level idea of a friendly animated presence.

![Provisional Glint avatar: a softly rounded luminous spark with eyes and tiny feet, walking above three listening, thinking, and speaking expressions.](assets/glint-avatar-concept.png)

This preview is a still concept, not an approved final identity or implemented animation. Provenance: generated with built-in ImageGen in the originating design conversation; stylized concept prompt summarized as an original friendly living spark/light core with eyes and feet, walking and listening/thinking/speaking poses, neutral studio backdrop, restrained glow, no copied Muse mascot or text. The studio rendering communicates character; production UI uses a small lightweight asset with reduced effects, rather than rendering this scene continuously.

Use warm off-white `#F6F3EA`, dark ink `#202923`, forest `#285E47`, and restrained amber `#D9A441`. Amber is decorative and must not carry low-contrast text. Use system sans-serif, 16px minimum body text, clear headings, 8px spacing increments, 12–16px card corners, and fine neutral borders. Camera surroundings should stay quiet. Validate final color pairs for WCAG AA before shipping; these tokens are a proposal, not an accessibility audit.

Desktop: camera takes roughly two-thirds of available width; a 320–400px side panel holds current step, source thumbnail, and conversation. Mobile: camera above a compact step card, expandable source/conversation sheet, and persistent controls above safe-area insets. At 320px width and 200% text zoom, controls must wrap without horizontal scrolling or hiding Stop. Camera orientation changes cannot reset the task.

Avatar: 40–56px in the header or reserved corner outside the camera content; never covers tools, evidence overlays, captions, or controls. Arrival lasts at most 1.2 seconds. Animate transform/opacity on a small vector, never an extra video stream or generative render. No perpetual particle system, large blur, or full-scene animation. Animation pauses when hidden and reduces under battery/thermal pressure independently of capture.

| State | Motion / shape | Accessible text |
|---|---|---|
| Waking | Stretch and two small steps, once | Ready |
| Listening | Slight forward tilt, gentle center pulse | Listening; mic state remains separate |
| Thinking | One slow halo sweep, bounded repeats | Checking your latest view |
| Speaking | Small vertical rise tied to speech envelope | Speaking, with captions |
| Observing | Settled posture, infrequent blink of center | Camera active; last analyzed age nearby |
| Uncertain | Tilt, halo opens into an arc | Need a clearer view |
| Reconnecting | Static broken halo; optional slow fade | Reconnecting; guidance paused |
| Paused | Feet tucked, halo off | Paused; camera and microphone off |

Reduced motion uses static state variants and text; disable arrival movement, pulses, and sweeps. Never use color or movement alone for status. Screen readers announce state transitions politely without announcing every sample. All controls support keyboard focus, descriptive names, and at least 44px touch targets. Source pictures include meaningful descriptions. Captions are selectable, scalable, and independent of audio. Provide mute, push-to-talk, text-only conversation, and configurable correction frequency.

Persistent controls: camera status, microphone status, last analyzed age, Pause, Stop, mute, and Check now. A visible “Camera active / analysis delayed” distinction prevents a lively avatar from implying fresh perception. Low-connectivity and model-disabled states remain useful for confirmed static instructions.

## 4. Finding and confirming instructions

Search is a bounded backend operation, separate from the coaching loop. Prefer manufacturer support pages and original manuals for products; prefer an identifiable original recipe publisher for cooking. Search-result rank is not authority. User uploads remain user-provided until identity and relevance are checked. If an authoritative source cannot be found, explain the limitation and ask for a manual; do not fabricate official instructions.

The retrieval pipeline should:

1. Collect candidate title, publisher, source URL, product identifiers, language/region, revision/date, and fetch time.
2. Fetch allowed resources in an isolated parser with MIME, byte, page, image, redirect, and timeout limits. Block private/local network addresses, unsafe schemes, and redirect or DNS paths that reach internal services. Do not execute document code or page scripts.
3. Extract text and useful original diagrams with page/section coordinates. OCR only when necessary, retain OCR uncertainty, and cross-check quantities, units, dimensions, and diagram labels. Do not replace missing diagrams with invented product images.
4. Produce a versioned source bundle: content hash, canonical URL, page/section anchors, extracted-image references, parts/ingredients, tools, warnings, ordered steps, prerequisite edges, alternative branches, and unresolved conflicts. Preserve attribution and assess source use rights before public redistribution.
5. Present identity and version for confirmation; bind the approved graph to that source hash. A changed remote document cannot silently replace the approved copy.

Every actionable instruction must point to a source location or be clearly labeled as a user-confirmed adaptation. Conflicting sources or unsupported quantities block the affected step. Record page numbers and image crop coordinates so a reviewer can inspect the original context.

Retrieved text, images, captions, and URLs are untrusted data. They cannot change system policy, trigger tools, request credentials, select endpoints, or instruct the assistant operationally. Separate extraction from tool authority, validate typed outputs, and permit only application-defined search/fetch actions. Test malicious instructions embedded in manuals and diagrams.

## 5. Observation and task state

The temporal perception component describes evidence. The task engine decides which transitions are allowed. Conversation wording must not directly mutate completion state.

| Record | Minimum proposed fields |
|---|---|
| Task/source | owner, task ID, confirmed source hash/version, identity, consent version, graph revision |
| Step | ID, source anchors, required parts, prerequisite expression, alternative group, observable completion criteria, reversibility, warnings |
| Observation | evidence ID, session/stream epoch, ordered sequence, capture interval, received time, quality, regions, detected action, uncertainty, model/version |
| Belief | proposition, observed fact or hypothesis, supporting/conflicting evidence IDs, confidence calibration version, expiry |
| Step state | pending / eligible / in progress / observed complete / user-reported complete / disputed / blocked; revision and actor |
| Decision | candidate action, graph revision, evidence IDs, capture age, rationale summary, expiry, final policy outcome |
| Session | owner, phase, connection epoch, last acknowledged event, budget, device capabilities, retention choices |

Use prerequisite expressions such as all-of and any-of, not just a linear checklist. Only encode alternate orders when supported by the manual or explicitly reviewed adaptation; an LLM cannot waive a prerequisite. For a synthetic assembly example, left and right panel installation can commute, while brace attachment requires both. Threading a screw is distinct from fully tightening it. A still image may support a visible washer, but not prove that a screw was torqued correctly.

Completion evidence is task-specific: visible part identity, orientation, attachment state, relevant temporal sequence, and any required user measurement. Occlusion is unknown, not absence. A user's “done” is user-reported completion unless verified. Later contradictory evidence marks dependent states disputed and prompts reconciliation; it must not silently erase history or force a hazardous reversal.

Before speaking a correction, deterministic checks require: confirmed source; valid task revision; evidence from the current session; suitable quality and age; prerequisite violation supported by observations; no unresolved relevant contradiction; and no suppression from pause, interruption, or duplicate-correction cooldown. A second model opinion is not independent evidence of the scene. If these checks fail, ask for a better view or remain quiet.

Confidence scores must be calibrated on the evaluation set; a model's self-reported “0.9” is not a measured probability. Use a higher evidence threshold for unsolicited correction than for a tentative answer. Limit ordinary unsolicited cues to one per 15 seconds initially; measure and tune with users. Suppress repeats until meaningful new evidence arrives. Genuine time-critical protection cannot depend on an unproven remote response path; the initial scope avoids such tasks.

## 6. Capture, sampling, and temporal analysis

Continuous capture does not mean every frame enters a large model. Acquisition, local quality checks, event retention, network upload, vision interpretation, task transitions, and speech have independent bounded stages.

Proposed initial foreground profile, subject to device tests:

- Capture about 15 fps at 720p into an encoded rolling buffer. Keep roughly 12 seconds, including at least 4 seconds before a detected event. Enforce both a duration and byte cap (initial encoded cap 24 MB); never keep an unbounded decoded-frame array. Tune using actual device memory and codec support.
- Perform inexpensive local brightness, blur, framing, camera-motion, and lightweight tracking checks on downscaled frames around 5 fps. Distinguish camera movement from object activity where possible; tracking is a cue, not proof of action.
- Sample regularly around 1 fps even in an apparently unchanged scene. Also trigger bursts on hand/object interaction, task-relevant motion, likely transitions, user questions, and Check now. Scene change alone misses small or fast actions.
- For candidate actions, preserve ordered pre-event, action, and post-event frames or a short encoded clip, initially 3–6 seconds. Burst extraction around 6–10 fps is an experiment, not a guarantee of capturing every action. Maintain timestamps and sequence order; a collage alone loses temporal information.
- Send native clips only if the selected API demonstrably supports them. Otherwise use a bounded ordered frame sequence within verified input limits and mark temporal capability degraded. If that path fails fast-action gates, narrow the supported tasks instead of claiming video understanding.

Nominal starting queue limits per session: one in-flight vision request; one replaceable routine sample; up to three pending event clips with a total 32 MB cap. Bound all stages by bytes and age as well as count. Routine samples may be replaced by fresher ones. Event clips carry priority, time interval, retention deadline, and acknowledgement status. Overlapping clips can merge while retaining chronology and evidence references.

Never silently discard an important event. If event capacity is exhausted, persist a gap marker and affected interval, pause proactive guidance for affected steps, and ask the user to hold/show the result. Critical clips may be stored briefly in encrypted temporary object storage within consent and quota; they cannot bypass privacy limits. Retries use the same event ID, bounded backoff, and expiry. Do not accumulate an hour of deferred inference after an outage.

Stamp capture time with a monotonic device clock plus stream epoch and server clock mapping. Track clock uncertainty, upload delay, queue delay, inference time, and presentation time. Drop stale routine results; retain useful historical event facts without speaking them as current advice. Recheck decision freshness immediately before text display and again before speech. New task revisions, pause/stop, or contradictory events cancel pending guidance; late provider results cannot reactivate it.

Fast actions between samples remain a real failure mode. Buffering, bursts, and periodic checks reduce this risk but cannot prove it eliminated. If the camera misses an irreversible transition, request user confirmation and label the gap. If camera motion or occlusion prevents an assessment, ask for a stable view instead of inventing the missing action.

## 7. Conversation and reasoning

Use one primary Meta reasoning adapter with the user's session-only key handled by the backend, subject to capability verification. Give it the confirmed current source excerpts, eligible steps, a bounded recent evidence window, retrieved relevant history, and the user's current question. Request a schema-validated decision: answer / ask / propose correction / propose transition / stay quiet, with evidence and source references. Application policy approves transitions and delivery.

Separate temporal vision from task reasoning logically, even if initial requests use the same provider. Temporal vision outputs observed events and uncertainties; reasoning relates those events to the task graph. Use selective escalation for ambiguous high-value cases, with a per-session limit. Do not run a constant panel of agents, or assume repeated model votes improve visual truth.

Voice is full duplex at the interaction level: user speech interrupts output, cancels queued speech, and becomes the newest conversational turn. Local interruption detection should stop playback without waiting for server inference. Echo cancellation and speaker playback must be tested to prevent Glint hearing itself. STT partial text is provisional; ambiguous model numbers, measurements, and negation require confirmation before state changes. Captions reflect actual spoken output and are cleared or marked interrupted when speech stops.

STT/TTS providers, streaming support, languages, pricing, cancellation, retention, and audio transport remain capability gates. Text mode and push-to-talk are valid first slices. Browser-native speech may be an explicitly labeled experiment where supported, but cannot be assumed reliable across browsers. Never present prerecorded or simulated dialogue as a live model exchange.

### Bounded memory

Persist an append-only event history and transactional current task state. Keep the prompt bounded: current graph neighborhood, recent observations, compact session summary, and a small retrieved set. Index earlier evidence by step, part, action, and time; start with database fields and full-text search, not a separate vector database. Summaries retain evidence pointers, uncertainty, contradictions, and source revision. They do not become new visual evidence.

A user asking “Did we put the washer in earlier?” retrieves the matching event and source, not the whole video. Expired/deleted evidence cannot be reconstructed by a summary; answer with its verification limitation. Benchmark memory retrieval and grounding after 60+ minutes rather than assuming a long context window solves memory.

## 8. Smallest provisional stack

| Component | Provisional choice | Reason / gate |
|---|---|---|
| Client | TypeScript, React, Vite static build, HTTPS CDN/edge; MediaDevices and a dedicated Web Worker; lightweight vector avatar | Responsive public UI; local quality/motion work keeps controls responsive; no 3D engine |
| Server | Node 24 LTS, TypeScript, long-running HTTP/WebSocket gateway and async session worker; bounded isolated document parser | Sustained connections, media-upload backpressure, and analysis without a long-lived serverless request |
| Validation | Shared typed schemas with runtime validation | Validate inputs, model outputs, source extraction, and session events |
| Identity/state | Managed PostgreSQL with managed authentication and transactional ownership checks | Durable task state, source revisions, budget ledger, reconnect events, and per-user isolation |
| Temporary media | Private object storage alongside the database provider | Only consented bounded event evidence; signed short-lived access and lifecycle deletion |
| Inference | One backend Meta adapter using session-only BYOK initially | Prior user text/image tests exist; model identity and temporal capability still require verification |
| Source search | One verified search API plus constrained server fetch/parser | Authoritative discovery without a crawler fleet; provider and access are unchosen |
| Voice | One STT and one TTS path after measured capability checks | No new voice service until interruption, language, and latency needs are known |
| Optional compute | Modal worker only after approved access and measured benefit | No baseline GPU tracker; separate funding and evaluation required |

No Kafka, Kubernetes, separate agent platform, GPU cluster, vector service, or Redis in the first slice. A single gateway process uses bounded per-session queues. Durable metadata and an expiring database lease identify the active session owner. At multi-replica scale, route sessions consistently, renew leases with fencing tokens, and reject stale-owner writes. Add a broker or dedicated worker only when measured concurrency and recovery requirements justify it.

This long-running gateway needs a host that supports its actual connection duration and resource limits. Do not assume ordinary short-lived serverless handlers can sustain it. Static hosting may be separate later if warranted.

Native mobile is the eventual direction if sustained capture, codec control, thermal management, and device integration justify the cost. Web first is a prototype tradeoff, not proof of native-equivalent reliability. OS/browser backgrounding, screen lock, permissions, battery, and thermal policies can suspend capture. Detect visibility/track changes, stop or mark the gap, and require a truthful resume check. Never promise unlimited invisible background camera use.

### Session gateway and recovery

Authenticate before session creation; issue short-lived session-scoped transport authorization. Validate ownership on every task, media, and event operation. Use secure cookies/origin checks where applicable, message size/rate limits, quotas, and isolated media namespaces. User-supplied provider keys enter only a masked ephemeral field and dedicated TLS submission; they are never bundled, placed in URLs, browser storage, analytics, or logs. Application-owned service secrets remain server-side.

### BYOK default and billing boundary

Disclose that Glint's backend and hosting infrastructure receive the key to proxy inference. After exchange, clear the input and retain only an owner/session-bound opaque reference on the client. The raw key remains in the backend owner's process memory for provider calls; do not persist it in the database, media store, durable jobs, or Redis. Proposed key lease: 15 minutes idle / 120 minutes absolute, with visible expiry and Disconnect key. A process restart, failover, or expired lease requires key reentry even when task progress survives. Runtime memory cannot guarantee perfect zeroization.

Validate access using the smallest officially supported operation; if a minimal inference request is required, disclose its possible charge before consent. Sanitize all errors. Allow only verified provider destinations, not arbitrary endpoint URLs. Optional remembered keys are excluded initially; a later opt-in feature needs managed KMS envelope encryption, per-user decrypt authorization, metadata-only access audit, expiry, and tested deletion.

The key pays only its provider's usage. Glint still needs funding and quotas for hosting, search, database/auth, storage/egress, separate STT/TTS, and optional specialized compute. Show provider usage estimates separately from the Glint service allowance. An app budget stops new dispatch but cannot enforce an account-wide provider hard cap or undo in-flight charges. Credit/key failures pause paid analysis and expire queued feedback while static confirmed instructions remain available.

Proposed phases: identifying → awaiting confirmation → ready → observing ↔ paused → ended. Reconnecting/degraded is an explicit transport condition that inhibits fresh advice. Client events carry session ID, stream epoch, sequence, event ID, and graph revision. Acknowledge only after required durable writes. Compare-and-swap state revisions and idempotent event processing prevent duplicate completions and duplicate speech on retries. Speech delivery has an expiry and connection epoch; replay state, not old utterances.

On disconnect, stop cloud-bound capture by default, clear unsent routine media, and show the gap. A deliberate local-buffer option would need explicit consent and strict limits. Resume loads the approved source and last acknowledged state, starts a new stream epoch, and requests a current view. Process crashes preserve confirmed state and gap markers; in-flight uncommitted interpretations remain unknown. Per-user stop/delete invalidates active work so late callbacks cannot restore media or decisions.

## 9. Privacy, reliability, and cost

Default proposal: raw rolling video stays in device memory and is overwritten; uploaded event clips are encrypted, private, and deleted after analysis plus a short retry window, capped initially at 15 minutes. Save source and task progress for seven days only with explicit resume consent; otherwise delete at session end. Optional evidence retention is separate, opt-in, time-limited, and revocable. Final retention policy, provider retention, backup deletion windows, and jurisdiction need agreement before launch. If required evidence has expired, mark it unavailable.

Pause stops camera and microphone tracks, upload, and queued analysis; it does not merely dim the UI. Stop closes the session and offers progress retention/deletion choices. Offer microphone-only or text/manual modes. Obtain separate permission for evaluation recording; no default training use. Redact or crop irrelevant surroundings locally when feasible without destroying task evidence. Treat bystander audio and images as sensitive.

Operational logs contain only IDs, timings, counters, error classes, model/version, and coarse resource measurements. Never log keys, private inputs, source uploads, raw transcripts, frames, or provider payloads. Scrub error reporting and tracing; do not enable session replay on camera or conversation views. Measure with synthetic content or specifically consented evaluation captures.

Model cost scales with analyzed observations, image/video input representation, context tokens, output tokens, retries, and escalations. Capture fps alone does not determine inference cost. Voice duration, source extraction, storage, and egress add separate costs. Estimate each session as vision calls × measured input/output cost + reasoning tokens + STT minutes + TTS output + temporary bytes/egress. Do not quote dollar-per-hour numbers until actual provider billing units are verified.

Enforce a server-side session budget, maximum observation rate, token/context ceilings, escalation count, and concurrent session limit. Reserve estimated budget before dispatch and reconcile actual usage; uncertain billing receives a conservative bound. Warn before reducing analysis; show manual-only mode when the cap is reached. Never silently reduce monitoring while implying full coverage. Local capture and avatar resources have separate budgets. Avoid starting source search again during every camera inference.

### Access status supplied by the user

| Item | Known status | What it does not establish |
|---|---|---|
| Meta | User reports $150 applied, key created, successful text and image chat tests | Exact model/API revision, production entitlement, video/streaming/audio support, accuracy, and sustained throughput remain unverified |
| Image request | One reported description took 18.2 seconds | This is not a latency distribution; accuracy was not independently assessed, and it misses the proposed live-coaching budget |
| Baseten $100; Modal $100; Fireworks $25 | Applications submitted, pending | No confirmed credits, partner access, deployment, or working integration |

Before selecting a live adapter, record official documentation, exact model ID, accepted modalities, frame/video limits, rate/concurrency limits, structured-output behavior, cancellation behavior, data retention, cost, and measured response distributions. Do not invent endpoints. An adapter change must be visible and separately evaluated; display the actual provider and model used.

## 10. Performance targets and acceptance gates

All numbers below are proposed engineering targets, not achieved results or provider promises. Start with the chosen low-risk task and revise product scope if feasible latency is slower. Measure capture-to-delivery, not only provider response time.

| Stage / metric | Proposed initial budget or gate |
|---|---|
| Local quality decision | p95 ≤100 ms on the downscaled sampling path |
| Event formation | Typically 1–3 seconds; up to 6 seconds for a deliberately longer temporal clip; counted in total age |
| Upload + queue | p95 ≤700 ms on a declared good-network profile; queue wait ≤300 ms |
| Vision + task decision | p95 ≤2.5 seconds for the supported routine task; verify empirically |
| Text/first speech delivery after decision | p95 ≤700 ms |
| Simple check, capture-to-visible answer / first speech | p50 ≤2.5 s, p95 ≤5 s |
| Temporal correction, action onset-to-delivery | p50 ≤5 s, p95 ≤8 s; report completion-to-delivery too |
| Freshness at delivery | Latest relevant visual evidence ≤5 s old; full action interval disclosed in metrics; expired decision suppressed |
| Barge-in | p95 playback stop ≤200 ms from local interruption detection; measure detection delay separately |
| Reconnect | Proposed p95 ≤10 s to restore state after network returns; current-view verification still required |

Individual percentile budgets do not mathematically add into an end-to-end percentile. Instrument the entire path and report both distributions. Long actions and failed networks may exceed targets; the interface must enter delayed/uncertain mode. The reported 18.2-second call requires benchmarking, reduced input, another verified capability, or a slower check-on-request product before proactive coaching can pass.

### Task-specific evaluation set

Create consented or staged recordings for the selected exact product/manual revision. Annotate parts, action intervals, prerequisites, valid alternate orders, actual mistakes, recoveries, occlusion, off-camera gaps, and earliest/latest useful correction times. Use two independent annotators with adjudication. Split by participant, device, scene, and task instance to avoid near-duplicate leakage; keep a held-out set unused for prompt/threshold tuning.

Initial proposed set: at least 30 complete task sessions, 100 labeled supported mistake opportunities, and matched correct/alternate-order controls. Include rare hard cases intentionally, report their frequency, and do not mistake this enriched set for population prevalence. Add real prospective user sessions before launch. Report per-task results and confidence intervals; aggregate accuracy alone is insufficient. Synthetic examples alone cannot establish Glint's real-world accuracy.

| Area | Proposed release gate for the first supported task |
|---|---|
| Identification and provenance | All held-out ambiguous/wrong-model fixtures block coaching until resolved; all actionable steps resolve to the approved source or explicit user adaptation |
| Missed mistakes | Timely mistake recall ≥90% on the defined supported error classes; also report recall including occluded/off-camera cases and abstentions |
| False corrections | ≤2% of unsolicited correction attempts are wrong, and ≤0.1 wrong corrections per session-hour; report counts, denominator, interval, and severity |
| Grounding | Every correction carries inspectable source/evidence references; zero unsupported definitive completions in the held-out review |
| Order tolerance | All curated valid alternate-order cases avoid an order-only correction; invalid prerequisites remain blocked |
| Uncertainty | Unobservable steps never receive verified completion; request clearer evidence or preserve user-reported status |
| Privacy and isolation | Zero cross-user state/media access or private content in logs in the defined adversarial tests; pause/stop reliably stops new capture/upload |
| Recovery | Disconnect, retry, process restart, duplicate events, and out-of-order results cause no duplicate transitions or stale speech |

These are candidate gates requiring enough samples to interpret uncertainty, not guarantees that 30 sessions prove production safety. Review false-correction severity individually. A missed mistake is a supported annotated mistake without a useful cue before its action-specific deadline, even if eventually noticed. Report observability coverage so abstention cannot inflate success. Count statements presented tentatively but directing a wrong action as correction errors too.

### Long-session and load qualification

Run 60- and 90-minute sessions on declared representative iPhone Safari, Android Chrome, and desktop browser/device versions, then repeat supported native targets if built. Test plugged and unplugged operation, warm rooms, orientation changes, low battery, and repeated pause/resume. Observe battery drain per hour, thermal signals where exposed, OS warnings, camera fps, encoder pressure, dropped frames, browser/OS termination, heap/RSS, queue occupancy, bandwidth, and actual billing. If temperatures are not exposed, report that limitation and observable throttling; do not invent readings.

Proposed initial resource gates: ring/event buffers remain within byte caps; no sustained queue growth; after warm-up memory plateaus (investigate >10% drift over the final 45 minutes); no thermal shutdown or unrecoverable capture loss; measured traffic and battery drain fit device-specific published budgets chosen during profiling. A provisional upload target is ≤300 MB/hour on the baseline profile, with bursts reported separately. Battery/thermal ceilings must be set for selected hardware before a release decision, not hidden behind a universal number.

Exercise fast insertion/removal, repeated hand motion, camera pans, blur, dim light, obstructed parts, identical components, two simultaneous actions, unsupported modifications, corrections after undo, voice interruption, background/lock, permission revocation, and 5/30/120-second outages. Include source-change conflicts, forged event IDs, clock jumps, malformed model output, provider timeouts/429s, and exhausted budgets.

Load stages: 1, 5, then 20 concurrent sessions as an initial test envelope, not a capacity claim. Include active bursts, ordinary quiet work, slow uploads, noisy clients, and reconnect storms. Measure per-session fairness, p50/p95/p99 age, rate-limit errors, memory, queue saturation, database latency, and cost. Set advertised concurrency below the measured passing limit. Run overload tests to verify admission control and truthful degradation instead of growing queues. Re-run quality metrics after performance optimizations; speed changes must not silently reduce mistake recall.

## 11. Delivery boundaries

**Hackathon build slice:** one confirmed low-risk product/manual, text conversation, explicit camera start/pause/stop, regular plus triggered sampling, bounded event clips, current-step evidence, Check now, honest uncertainty, and basic durable resume. Add voice only after an early latency/interruption spike passes. If temporal inference fails, demonstrate a labeled checkpoint assistant and preserve the continuous-coaching work as unfinished. Fixtures, recorded replay, and live inference must have distinct visible labels and separate test evidence.

**Production direction:** a publicly published HTTPS website with authenticated ownership, reviewed session-only BYOK, funded app services, proven temporal interpretation, source/version governance, calibrated corrections, durable recovery, privacy deletion, budgets, long-session foreground device qualification, accessibility, load tests, operational support, and expansion by independently validated task families. Release requires secret scans and security review, including proxy/log capture, key expiry/reentry, cross-user access, SSRF, and provider-credit failures. This is a sustained engineering program; no claim that the whole production system fits a hackathon deadline.

**Experimental research:** event-boundary models, learned action representations, custom streaming runtimes, richer evidence retrieval, and native sustained capture. Keep these behind evaluated adapters; none is a prerequisite for a truthful first checkpoint demonstration.

## 12. Research references and limits

Sources checked October 27, 2026. Research results are not Glint results.

- [StreamingVLM — NVIDIA research page, October 2025](https://research.nvidia.com/labs/eai/publication/streamingvlm/) describes compact KV-cache streaming and reports up to 8 fps on one H100. This depends on the model/runtime approach; a hosted chat API does not thereby expose KV-cache control. It motivates bounded processing, not a throughput promise for Glint.
- [Event-VStream — January 2026 preprint](https://arxiv.org/abs/2601.15655) studies event-driven long-video understanding. Event boundaries are a useful research direction; Glint still needs periodic sampling and retained pre-event evidence to address missed short actions.
- [ReMem — October 5, 2026 preprint](https://arxiv.org/abs/2610.05940) combines compressed historical context with query-relevant visual memory retrieval. Glint can adopt the architectural principle of bounded context plus evidence retrieval without claiming that application summaries implement its internal method or reproduce benchmark results.
- [V-JEPA 2 — Meta research, June 11, 2025](https://ai.meta.com/research/publications/v-jepa-2-self-supervised-video-models-enable-understanding-prediction-and-planning/) studies video representations and prediction/planning. Consider future action representations only after task-specific evaluation; it is not a turnkey conversational coach or proof of a hosted camera API.

## 13. Decisions still needed

1. First exact task/product and authoritative manual revision; approve or replace the desk-assembly candidate.
2. Target foreground devices, languages, and accessibility needs; what task interruptions users tolerate.
3. Exact Meta model/API capabilities and measured latency; whether the supported mode can be temporal coaching or checkpoint assistance.
4. Search, hosting, database/auth, temporary storage, and optional STT/TTS providers after access, retention, limits, and prices are verified.
5. Provider and app-service budgets/funding, BYOK key lease, progress/evidence retention, evaluation consent, device battery/thermal ceilings, and ownership of source/quality review.
6. Available team/time and demo date.

See [GLINT_PLAN.md](GLINT_PLAN.md) for the staged build and stop conditions.
