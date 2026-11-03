# Test evidence, Nov 3, 2026

Entrant supplied the final `npm test` output: **355 unit/integration tests passed**. This is the one chosen headline, not a sum with spec-file counts. It includes submission-policy coverage.

The entrant also supplied a complete `npm run test:e2e` result: **73 passed, 2 failed**. Failures:

- Device-speech muting regression fixture did not select device speech or announce `voice: none`, while the current app defaults to cloud voice.
- Accessibility scan ran while React Suspense still rendered Loading Glint, before main app landmarks mounted.

Repairs select the intended mock mode and voice event, make the loading state a main landmark with a heading, and wait for the actual UI before the app accessibility scan. Targeted and full rerun status must be recorded below, without replacing these original results.

## Reruns

`npm run test:e2e`: **75 passed**, completed after the two documented repairs. No combined all-suite headline is calculated. This evidence is published with the submission-profile commit; use the Git history for the exact revision.

Local `npm test`, `npm run lint`, `npm run build:submission`, `npm run build` and `npm run test:submission` passed during the audit. The dedicated submission browser checks exercise explicit no-key replay, no charged calls, pose-off behavior and browser-speech dispatch. They are not real-provider receipts.

Command logs are local ignored artifacts under .tmp-test; they are not uploaded automatically. The full main browser run completed successfully as recorded above. Clean macOS/Linux installation and real-device testing are separate evidence gaps.
