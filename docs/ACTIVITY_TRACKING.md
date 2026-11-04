# Activity tracking

Glint asks one confirmation question before starting. The user can click Start tracking or say yes/start; no/not now cancels the pending request. Repeated start proposals while confirmation is pending or tracking is active do not recreate the session or reset its count. Stop the current session before starting a different activity. A compact Stop control stays inside the camera, and results appear in the conversation.

## Local hand-raise counting

Spark selects `mode: hand_raises` from the user's request. After Start, the existing local MediaPipe pose worker supplies shoulder and wrist landmarks with a target sampling interval of 100 ms (actual cadence depends on device speed). A separate counter runs independently of conversation requests, microphone activity and speech playback. There is no paid model call per movement and no six-second greeting cooldown.

A repetition is a stable hands-lowered baseline, either hand above shoulder level, and both hands lowered again. Each endpoint must remain visible for at least 200 ms. Both shoulders and wrists must be in view with sufficient confidence. Starting with a raised hand, holding a pose, a brief threshold crossing, stale frames, occlusion and frame gaps do not create repetitions. Hidden pages pause tracking; a camera change stops it. Resume requires a fresh lowered baseline and retains the previous total.

The live chip shows completed raises or tracker/visibility status. Pose data stays in the browser; content-free diagnostics record the count. Counts are observations, not certification of technique. The thresholds assume an upright, reasonably steady camera view of one person. Camera movement, inaccurate landmarks or low device frame rate can still cause missed or false counts.

## Other activities

`mode: observe` retains the sampled Meta vision path for broader activity descriptions. It is not an accurate repetition counter: requests wait for the shared conversation lane, and completed requests are followed by a three-second delay. Observation labels and configured sequences must not be presented as verified activity totals. Push-up, squat and arbitrary routine counters are not implemented in the local counting path yet.

SAM remains available for explicitly requested short object-motion clips. Its bounding-box direction summary does not itself count repetitions or maintain continuous identities across clips.

## Verification limits

Counter tests exercise known synthetic landmark sequences, including 3/3 and 5/5 raises, holds, jitter, missing joints and time gaps. Integration checks verify counting while the conversation lane is busy, no inference per repetition, confirmation, stop and result delivery. The existing real pose-worker browser test verifies model loading/detection on an attributed still image. These checks do not establish real-video count accuracy; live/recorded movement validation is still required.

