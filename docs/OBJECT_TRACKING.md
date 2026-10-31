# Experimental object movement tracking

Glint can now submit a user-requested two-second camera clip to Meta SAM 3.1, parse the returned geometry and summarize movement relative to the camera. It does not run continuous object tracking or establish parity with Gemini Live.

## Use it

1. Connect a Meta key with SAM access in Settings. Enabling object analysis alone does not start a paid call.
2. Ask “Which way did I move the mouse?” or “Track the mouse” in the conversation. A narrow local intent route handles common named objects; an unclear object requires clarification.
3. If there is no fresh valid recorded result, Glint asks for a new movement. Open the camera if it is off, then explicitly choose **Ready — check movement**.
4. Keep the camera still and move the object during the two-second recording. The camera-relative result appears in chat. **View clip** opens optional detail; **Check again** returns to readiness and does not automatically record.

The button sends a paid SAM request using the session's connected Meta key. No SAM calls happen automatically. Hosted SAM bills video for at least 50 frames per request, even for shorter clips. The existing 100-dispatch session allowance is not a dollar spending cap. Model-list success for Spark does not verify SAM entitlement.

## Pipeline

Browser MP4 capture → authenticated `/api/track` → session engine → `sam-3.1` via Meta Responses → official `@meta-sam/parser` → per-object frame positions → movement summary → short-lived Spark context.

- Capture is bounded to two seconds, longest edge 384 pixels, 12 target frames/second, and 600 KB. It contains no microphone audio.
- MP4/H.264 is requested with MediaRecorder. If the browser cannot record the supported format, the action fails visibly before dispatch. SAM does not accept WebM, so the app does not silently substitute it.
- The server checks size, timestamp bounds and the MP4 header. Full codec/container decoding is done by the provider, not by a new local media parser.
- Segmentation output is bounded before mask decoding. Incomplete output, malformed records, inconsistent geometry and provider errors fail clearly; no automatic paid retry occurs.
- SAM object IDs are used only within one response. Multiple matching tracks, low confidence, too few frames or missing frames yield **uncertain** rather than guessing identity or direction.
- Movement is derived from normalized box centers, with a dead zone for small changes. Outputs include left, right, up, down, diagonal, back-and-forth and little movement. These are simple geometric heuristics, not a qualified activity classifier.
- Direction is **relative to the camera view**, not the desk or the user's body. Moving the phone can create apparent object motion. The app does not yet compensate for camera motion or maintain identity across clips.
- Clip bytes stay in browser/server request memory and are sent to Meta; they are not written to SQLite or uploaded through the persistent Files API. Remote provider handling remains subject to provider terms. Geometry context is session-scoped, expires from prompts after 15 seconds from clip end, and is invalidated by stop, task/session changes or camera reset.
- Voice may interrupt the tracking action. This uses the current shared bounded inference lane; it does not add an unbounded background queue. True independent vision scheduling remains future work.

## What was verified

Fixture tests cover official SAM mask grammar, motion directions, ambiguity, missing frames, malformed/incomplete output, request quotas, duplicate requests, cancellation and exclusion of clip bytes from Spark context. Browser tests record a real synthetic-camera MP4, mock the SAM response, and check the phone result display. No real credentials or paid SAM requests were used in these tests.

Live release gates: actual account access, left/right and back-and-forth accuracy on held-out mouse clips, occlusion/re-entry, camera movement, mirrored views, small fast objects, phone/browser format support, first/total result latency, billing and failure recovery. To compare with Gemini Live, run the same labeled tasks on the same device/network, randomize order, record product/version/date, and compare accuracy and response time. A successful integration alone proves none of those outcomes.

## Sources

- [Meta media segmentation](https://dev.meta.ai/docs/media-segmentation)
- [Supported prompts, formats and billing minimum](https://dev.meta.ai/docs/sam/segmenting)
- [Output IDs and tracking limits](https://dev.meta.ai/docs/sam/reading-segmentation)
- [Official parser](https://dev.meta.ai/docs/sam/client-libraries)
