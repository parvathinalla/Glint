# Optional photo look previews

## Camera flow (default)

The conversational model selects a validated `edit_camera_image` tool for an
explicit image request, such as “Show fairy makeup on me.” With the camera open,
Glint captures a fresh frame and generates without separate capture or submit
clicks. Progress and cancellation stay on the camera screen; the generated image
opens in a labeled dialog over it, with Download and a close button.
Voice requests follow the same path without opening Conversation.

If the camera is off, Open camera for this task is required before capture.
Follow-up requests can edit the last generated image, including after the camera
is turned off. Closing the result keeps that image in transient memory for
follow-ups; End session clears it. Canceling or switching cameras during a
camera-based generation prevents the old result from appearing. Provider failure
shows an error and does not automatically retry.

A request to explain a visible issue uses `annotate_camera_frame` on the actual
recent evidence frame, with numbered marks, rather than generating a replacement
that could invent the issue. Download source frame saves the unmarked original.

## Manual fallback

When camera tools are disabled (`glint-camera-tools` set to `0` in localStorage),
the older Conversation photo controls remain available. Capture camera view
freezes the current stream for review; Retake replaces it; Generate preview
starts the paid request. JPEG, PNG and WebP uploads up to 10 MB are an optional
fallback. HEIC is unsupported.

Both paths re-encode input to JPEG, no larger than 1024 px on its longest side
and under 600 KB, removing metadata before dispatch.

`POST /api/look-preview` requires the existing session cookie, matching origin,
CSRF token, explicit consent, current epoch, unique request ID and connected key.
It shares the 100-call session allowance. One image may run alongside one serialized
conversation/transcription request; a second image and other camera work are blocked. Each attempt
counts as one dispatch, including provider rejection; there are no automatic retries.
The image lane has a bounded 120-second timeout. Cancel and session end invalidate
the pending result. Canceling an ordinary follow-up does not cancel the image.
Image tool arguments stay internal and are never used as the spoken acknowledgment.
Dispatch skips neural speech initialization; provider rendering time remains external.

The server calls `muse-image-1.0` through `https://api.meta.ai/v1/responses`, with
`store:false` and image/web search and shell tools disabled. Only supported,
bounded PNG/JPEG/WebP bytes are returned as a data URL; remote output URLs are
not fetched. Prompt instructions request identity, skin tone, age and proportion
preservation, with changes limited to the requested outfit, makeup or setting.
Real model results still require visual review.

Photos and results stay in transient browser/request memory. They are not written
to Glint SQLite, logs, localStorage or text-model conversation history. Photos are
sent to Meta when generation is requested; `store:false` is an API setting, not a
claim about all provider retention policies. Follow-up edits re-encode and reattach
the last displayed preview rather than creating a stored provider conversation.
A generated preview is labeled and can be downloaded. In the manual fallback,
Close clears the card. End session cancels work and clears image state in both paths.

Provider access, rate limits and output quality require a real account test.
Automated tests use fake images and mocked provider responses; no paid generation
is made during checks. Coverage includes consent/authorization, quota, duplicate
requests, invalid output, cancellation, text-only decline and iterative editing.

API references:
- https://dev.meta.ai/docs/image-generation
- https://dev.meta.ai/docs/cookbook/image-generation-basics
