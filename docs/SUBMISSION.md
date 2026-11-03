# Task 4: Glint submission draft

Demo video status: not recorded yet, confirmed by entrant.

DRAFT. Do not submit until the public video and live receipts replace the remaining placeholders. Present-tense demo claims require footage. This draft does not certify stage-one eligibility.

## Project description (150 words)

Glint is a browser prototype for people whose hands are busy cooking, assembling, or crafting. They can ask a question aloud and supply recent camera evidence instead of repeatedly typing a description. Meta transcription turns speech into text, and a connected Muse model reasons over the question and selected frames. The submission profile speaks through the browser and disables experimental speech providers and pose inference. Requested movement analysis has a SAM adapter, but its inclusion depends on a verified account run. The central design principle is provenance: an observation, a user statement, an inference, a source instruction, and general model knowledge must remain distinct. If a bowl tilts over a pot but its contents are unseen, Glint should not claim that salt was added. Current code implements bounded media, cancellation, and user-reported task progress; complete provenance memory remains unfinished. The demo must expose these limits rather than imply continuous understanding.

## Built during the hackathon

Event build window: Oct 27–Nov 4, 2026. Solo entrant: Parvathi Nalla. GitHub reports repository creation Oct 29, within the supplied window; available commit history starts Oct 28. [NEEDS EVIDENCE: asset origins, including the supplied animation. Confirm licenses and event-window work; the creation date alone cannot establish all authorship.]

## How Meta models are used

- Realtime speech adapter: `muse-voice-transcribe-1.0` at `wss://api.meta.ai/v1/asr/realtime`, plus WAV recovery at `https://api.meta.ai/v1/asr/transcribe`. Implemented with tests; demo receipt pending.
- Conversation/scene adapter: Meta Responses at `https://api.meta.ai/v1/responses`, model selected from the connected account. [NEEDS EVIDENCE: main-app selected ID `muse-spark-1.3`.]
- Optional SAM adapter: `sam-3.1` at `https://api.meta.ai/v1/responses`. Include only after one real requested movement clip succeeds and is shown in the video. No live quality claim yet.

Muse Image and partner-configurable comparison agents are outside this submission narrative. Browser speech provides output. Partner generative-inference credits are not used by the explicit submission profile; historical billing is not asserted.

## Submission form fields

| Field | Value |
| --- | --- |
| Project name | Glint |
| One-line description | Hands-busy task guidance grounded in selected camera evidence, with uncertainty about unseen actions. |
| Track | Indie Developer |
| Theme | Build for Your World |
| Team | Parvathi Nalla, solo |
| Repo URL | https://github.com/parvathinalla/Glint |
| Demo video URL | [DEMO VIDEO URL] |
| Live demo URL | [LIVE DEMO URL] |
| Verified test total | 355 unit/integration tests passed (`npm test`) |

## How you used Meta's models

Glint routes speech through the implemented Muse Voice Transcribe adapter and sends selected camera frames with the user's question to the Meta Responses API. The connected model produces a short answer or a validated camera action. An optional SAM adapter analyzes a newly requested movement clip and converts returned geometry into camera-relative movement. These are actual code paths with fixture coverage, not a scripted substitute for inference. [NEEDS EVIDENCE: recorded main-app model IDs, one successful receipt per claimed model, and one failure. Delete any model sentence not demonstrated.] The submission profile uses browser speech, with external TTS and pose inference disabled.

## Demo script: record below three minutes

Use captions. Use the explicit submission profile with pose off. Do not edit a fixture replay into a live inference sequence. The timestamp ranges below are an editing plan, not measured runtime latency. Stop the final export by 2:59 so “under three minutes” is true.

| Time | Show | Say / evidence requirement |
| --- | --- | --- |
| 0:00–0:20 | Hands-busy prep, Glint camera and labelled submission profile | State the concrete interruption problem. Show the actual selected Meta model, not only a logo. |
| 0:20–1:00 | Ask one useful prep question aloud; show transcript and grounded answer; briefly show ASR/Responses adapter | Identify Muse Voice Transcribe and the verified conversation model. Show that idle time does not manufacture speech. Do not claim complete selective-coaching policy from mere silence. |
| 1:00–2:00 | Tilt the small bowl over a pot, with contents deliberately unseen; ask whether salt was added | Expected: “I saw the bowl tilt, but couldn't see its contents.” Label observed, inferred and not seen. If the actual answer differs, do not dub a correct answer over it. Show the failure or remove the memory claim. This is an acceptance test, not a proven ledger. |
| 2:00–2:50 | Request one timed visible-condition check; then End session | Label it a requested one-shot reminder, not an autonomous proactive system. Use a safe visible condition. Show the real result or explicit uncertainty, then camera/mic off. A spontaneous coaching beat is [NEEDS EVIDENCE]; do not imply it exists. |
| 2:50–2:59 | Repo URL and limits | “Browser prototype; full provenance memory is still in progress.” End before 3:00. |

SAM is not mandatory in this script. If claiming SAM in About, table or portal, insert a real new-clip demonstration and receipt within the same duration, replacing a weaker beat. Do not list an unseen integration merely because an adapter exists.

## Pre-submission checklist

- [ ] Exact track copied identically to portal, About, README and this draft.
- [ ] Public repo creation date verified; all code/assets comply with event window and rights.
- [ ] Public video exists, is under three minutes, and shows real Meta calls in the opening ninety seconds.
- [ ] Spark/ASR and any optional SAM claims match LIVE_VERIFICATION receipts.
- [ ] Browser speech profile is used; pose and experimental inference are off.
- [ ] Salt uncertainty shown honestly; no invented contents or completed task memory.
- [ ] Current test summary pasted by entrant; one chosen headline total used consistently.
- [ ] Clean-machine setup attempted and results recorded.
- [ ] No key, private transcript or secret visible in video, commits or screenshots.
- [ ] README links checked signed out; fixture path labelled; license and asset notices present.
- [ ] Submit before Nov 4, 2026, 8:00 PM ET, leaving the final hour before the 9:00 PM ET deadline. Save confirmation screenshot.
