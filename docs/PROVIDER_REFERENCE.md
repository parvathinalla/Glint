# Meta adapter reference

Official documentation inspected October 28, 2026 before implementation:

- [API base and authentication](https://dev.meta.ai/docs/api-reference): base `https://api.meta.ai/v1`, bearer token authentication.
- [List models](https://dev.meta.ai/docs/api-reference/models/list-models): `GET /v1/models`; the app accepts IDs returned by the user's key and enables only the documented Muse Spark family for this first adapter. No guessed default model ID.
- [Chat completion](https://dev.meta.ai/docs/protocols/chat-completions): `POST /v1/chat/completions`, developer/user messages, nonstreaming response at `choices[0].message.content`.
- [Image understanding](https://dev.meta.ai/docs/image-understanding): image content uses `{type: "image_url", image_url: {url: "data:image/jpeg;base64,..."}}` in a user-message content array.

The adapter uses the fixed documented origin; it does not accept arbitrary base URLs, send images to storage services, enable tools, or automatically switch providers. Structured decision text is runtime-validated and unknown step references are rejected. No state completion follows directly from model prose. The current image path is a **selected still checkpoint**, not verified temporal video analysis. Model catalog access does not prove quality, image entitlement, latency, or every model feature.

The official documentation describes additional modalities. They are not implemented or verified in Glint. Provider names and listed IDs are shown in the interface rather than claiming a different model. Real-provider requests have not been run in this implementation session; automated tests use fake fetch responses and never spend user credits.
