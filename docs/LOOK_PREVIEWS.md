# Optional photo look previews

A request such as "Which Halloween look suits me?" offers a preview. This is a
local, conservative intent match, not a general tool-calling agent. "Yes" opens
the photo controls; follow-up style choices (for example fantasy then fairy)
update the same preview description without discarding a selected photo. Requests
such as "create an image" or "can I choose a photo?" open the photo controls. A
bare "No" asks for clarification; explicit cancellation closes the flow. "No, just
ideas" sends a normal text-only request. Spark also receives current look context
and is told that Glint supports image previews, without receiving photo bytes. During
camera/voice use, a main-screen link opens the card without reopening chat by itself.

The primary input is a still captured from Glint's existing live camera stream.
The preview shows that same stream, and Capture camera view freezes a frame for
review. Retake replaces it; neither action dispatches Muse Image. The native
phone-camera file picker is not used. File upload (JPEG, PNG, WebP up to 10 MB)
remains an optional fallback. After review, the user presses Generate preview. Browser processing reduces it
to a JPEG no larger than 1024 px on its longest side and under 600 KB. It removes
metadata; camera capture is explicit. HEIC is not supported.

`POST /api/look-preview` requires the existing session cookie, matching origin,
CSRF token, explicit consent, current epoch, unique request ID and connected key.
It shares the 100-call session allowance and single paid-work lane. Each attempt
counts as one dispatch, including provider rejection; there are no automatic retries.
The image lane has a bounded 120-second timeout. Cancel, session end and competing
work invalidate the pending result.

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
A generated preview is labeled and can be downloaded. Close clears the card;
End session also cancels work and clears it.

Provider access, rate limits and output quality require a real account test.
Automated tests use fake images and mocked provider responses; no paid generation
is made during checks. Coverage includes consent/authorization, quota, duplicate
requests, invalid output, cancellation, text-only decline and iterative editing.

API references:
- https://dev.meta.ai/docs/image-generation
- https://dev.meta.ai/docs/cookbook/image-generation-basics
