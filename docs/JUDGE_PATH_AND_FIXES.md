# Task 6: judge path, bounded fixes and residue checks

## 60-second no-key judge path

Use `npm run dev:submission` and the local URL in README. This is an explicit fixture replay, not a real model demo and not a substitute for the live video.

1. 0–10 seconds: read the submission banner: Meta API + browser speech; pose and comparison agents off.
2. 10–20 seconds: choose **Open fixture replay · no key, no AI inference**. Observe the labelled organizer example.
3. 20–40 seconds: review/confirm the original example instructions and start the illustrated replay. No camera is required for replay; do not switch to Live camera.
4. 40–50 seconds: choose Check now, open Evidence and limits, and inspect the user-reported step state. The illustration is not evidence of a real-world action.
5. 50–60 seconds: pause/end the replay or return home. The actual Meta demonstration is the separately linked public video.

If the key dialog opens, close it. A fixture should never ask for payment or pretend a provider was called. Timing above is an intended walkthrough, not measured performance.

## Ranked patch list

| Rank | File | Change / status | Risk | Re-run |
| --- | --- | --- | --- | --- |
| 1 | backend/submission-policy.ts; scripts/submission.ts; package.json | Added explicit dev/build/start submission profile: browser speech, no TTS mock, no LiveKit agent | Build and serve must use the same profile | tests/submission-policy.test.ts; build:submission; `npm run test:submission` |
| 2 | frontend/voice-player.ts; frontend/visual-awareness.ts; frontend/main.tsx | Submission flag forces device speech, disables pose and separate /livekit page | Browser voice quality varies; regular profile retained | tests/voice-player.test.ts; tests/speech.test.ts; `npm run test:submission` |
| 3 | frontend/App.tsx; frontend/companion-ui.css | Visible submission label and entry to existing no-key replay | Replay is deliberately scripted/illustrated, never live proof | labelled entry, no-key API trace and no paid calls in browser check |
| 4 | scripts/prepare-tts.mjs | Skip Kokoro downloads when neural voice explicitly disabled | Regular install may still prepare optional model assets | predev under submission profile; clean-machine install |
| 5 | README.md; docs/README.md; submission artifacts | Replaced first screen; preserved old README in build-log; marked requirements vs reality | Unfilled track/URLs block final copy | local link validation; signed-out external links |
| 6 | LICENSE; package.json; package-lock.json | Added MIT project-code license and aligned metadata | Does not grant rights to third-party media/models | inspect notices; obtain video origin |
| 7 | frontend/CompanionHome.tsx; diagnostics/test reports | Submission mode now rejects automatic recorded-audio dispatch and shows a retry/text notice; regular recovery is preserved | Changeses voice recovery; do not rush silently | npm run test:submission; voice e2e; real-device failure handling |
| 8 | backend/agent-provider.ts; shared/camera-tools.ts | Pending: semantic regression for broad status routing; narrow image scope or quarantine flow | Tool selection and speech may regress | tests/camera-tool-provider.test.ts; tests/e2e/camera-coordinator.spec.ts |
| 9 | render.yaml | Pending only if deploying: select main rather than stale comparison branch | Deployment cost and secrets, not required for the focused demo | runtime-config and production-server tests; review before deployment |

No full provenance store, scheduling service, account system or model feature is added in this pass. Their absence must remain visible. No experimental provider code is deleted; dependencies and imports remain valid.

## Scope-drift decisions

- LiveKit TTS and Kokoro: regular profile experiments, excluded from submission speech. Removing their code would break existing optional voice paths and associated tests.
- /livekit: comparison-only, disabled in submission. It lacks the main app's camera/tool context.
- Muse Image: real Meta adapter with tests, but no outfit/makeup story in this cooking demo. Keep in historical/experimental docs, not headline integrations.
- SAM: retain adapter; advertise only if actual account run and footage succeed. The optional integration must not block the core Spark/voice demo.
- Full provenance memory and Speech Arbiter: keep canonical design and salt acceptance behavior; call implementation incomplete.

## Secrets and residue checklist

Run locally; do not paste raw history or matches. These checks intentionally suppress secret contents. Exit status 0 from `rg -q` means a match needs private review, not proof of a leaked key.

```bash
# Current tracked environment files: .env.example is the expected exception.
git ls-files '.env*'
git check-ignore .env.local .env .data/
# Full history: detect likely key-like strings without printing their values.
git log --all -p --format= | rg -q -i 'sk-[A-Za-z0-9_-]{16,}|Bearer [A-Za-z0-9._-]{24,}'
# Find files needing local-path or address review without printing contents.
git grep -Il -F -e 'C:\Users\' -e '/Users/' -e '/home/' -- README.md docs
git grep -Il -E 'localhost|127\.0\.0\.1|[0-9]{1,3}(\.[0-9]{1,3}){3}' -- README.md docs
# Relative parent links are legitimate Markdown; inspect, do not bulk-delete.
git grep -Il -F '../' -- README.md docs
```

These commands work in Git Bash. In PowerShell, run the same Git/rg commands, then inspect `$LASTEXITCODE`; in macOS/Linux inspect `$?`. No match scan proves all possible credential formats are absent. For broader patterns privately inspect a scanner report, never print raw credentials. Review any source-history exposure and rotate a truly exposed credential before publishing.

The local development URL in the requested quickstart is an intentional exception to “no raw IPs.” Machine-specific paths are removed from the new README. Historical build notes can be sanitised without changing source facts; do not remove valid relative links or model version numbers because a broad regex flags them.

The new explicit profile does not assert that partner credits were never used during previous experiments. It asserts that those providers are disabled for the submission run.
