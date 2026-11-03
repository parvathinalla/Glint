# Task 5: one-run live verification worksheet

Status: EMPTY TEMPLATE. No paid model receipt or measured metric is asserted. Keep secrets and private footage out of Git. Fill only from one real run of the exact submission build; do not mix different devices, profiles or dates to suggest one flawless session.

| Date/time + timezone | Device | Browser/version | Model ID | Job | Latency + measurement boundary | Input tokens | Output tokens | Truncated response ID | Actual output / evidence | Result and honest negative reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [NEEDS EVIDENCE] | [NEEDS EVIDENCE] | [NEEDS EVIDENCE] | [main selected ID, expected muse-spark-1.3] | Grounded prep answer | [end of user utterance → first audible meaningful answer] | [provider receipt or unavailable] | [provider receipt or unavailable] | [last 6 characters, or unavailable] | [short actual response excerpt, consented] | [pass/fail + reason] |
| [same run] | [same device] | [same browser] | muse-voice-transcribe-1.0 | Voice transcript | [speech end → final transcript; do not call this full response latency] | [receipt or not reported] | [receipt or not reported] | [truncated provider ID or not reported] | [actual short transcript] | [including misrecognition if it occurs] |
| [same run, optional] | [same device] | [same browser] | sam-3.1 | New two-second movement clip | [recording start → usable result; separate recording from inference if possible] | [receipt or not reported] | [receipt or not reported] | [truncated ID or not reported] | [actual direction; raw confidence only if exposed by receipt] | [e.g. occlusion leads to uncertainty; do not invent a confidence] |
| [same run] | [same device] | [same browser] | [actual conversation ID] | Salt uncertainty | [exact boundary] | [receipt or not reported] | [receipt or not reported] | [truncated ID or not reported] | [verbatim short answer; observed/inferred/not seen] | [must include actual behavior, even if wrong] |
| [same run] | [same device] | [same browser] | [actual ID, or no provider call] | Honest negative test | [if meaningful] | [receipt/unavailable] | [receipt/unavailable] | [if any] | [real failure or explicit uncertainty] | [real cause if known; otherwise unknown] |

## Collect within a 30-minute timebox

This is a test plan, not a guarantee of success within the timebox. Stop and record failure rather than extending until only a good run remains.

1. Minutes 0–4: note commit SHA (`git rev-parse HEAD`), date, device, browser version and profile. Start `npm run dev:submission`. Confirm the visible browser-speech/pose-off banner. Keep captions visible. Enter the key only in the app.
2. Minutes 4–8: open the model selector/key UI and record its actual selected ID. Ask one short grounded prep question. Screen-record the utterance, transcript and first audible answer. Browser voice is not a Meta TTS claim.
3. Minutes 8–12: inspect your own provider dashboard or a private Network response for the same request. Copy only model ID, usage, truncated response ID and necessary timing. Current application traces do not contain provider tokens/IDs for every path. If unavailable, write `not reported`; do not modify logging to capture keys, bodies or raw media.
4. Minutes 12–17: perform the salt visibility test. Show a bowl tilting, but keep its contents unobservable. Ask whether salt was already added. Preserve the actual response. A plausible correct answer does not prove a complete ingredient-memory store.
5. Minutes 17–22, optional: enable object analysis. Ask to analyze a NEW movement clip. Wait for recording to start, move one mouse with a stationary camera, and retain the actual result plus receipt. If entitlement or MP4 support fails, write the failure. Confidence values are not currently displayed by every path; do not infer them from the summary.
6. Minutes 22–26: perform a negative test by covering the camera or creating ambiguous evidence. Ask a visible-state question. Record whether the app expresses uncertainty. Do not induce dangerous cooking actions.
7. Minutes 26–30: End session, confirm camera/mic stop, export diagnostic trace, fill this table and store the consented recording privately. Record exactly which rows appear in the final public video.

For a single row, a ten-minute recovery limit is enough to locate an existing receipt or mark it missing. Missing data is a result, not permission to invent values. Tokens are provider-specific; ASR may report duration rather than tokens. Never calculate fake token counts from text length. One run cannot establish p50/p95.

## Drop rules

| Failed or absent evidence | Required change |
| --- | --- |
| Exact main Spark ID absent | Omit muse-spark-1.3 from About/table; say selected Meta model only |
| Live ASR fails | Omit working hands-free claim from recorded flow; show typed input and disclose failure |
| SAM access/quality/footage absent | Remove SAM from About and final Meta-model table; leave adapter as optional implementation detail |
| Muse Image omitted from focused demo | Keep it outside submission integration claims |
| Salt answer overclaims contents | Do not claim ingredient recall or complete provenance enforcement; show limit or repair and rerun transparently |
| No real spontaneous coaching | Replace proactive claim with requested one-shot check, or remove the beat |
| Browser speech/pose-off profile not used | Re-record with submission profile; otherwise the build contradicts the approved design |
| No metrics/receipt | Keep the field marked unavailable; do not advertise latency, confidence or token totals |
| No public video | Stage-one readiness remains blocked, regardless of code quality |
