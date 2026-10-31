# Conversation-first interface

Branch: `codex/conversation-ui`, based on `task/a-realtime-asr`.

Implemented UI: direct welcome with a glossy shaded blue star, a single Start Glint action,
companion home, independent camera/microphone controls, camera flip/fullscreen,
conversation sheet, settings with system/light/dark appearance, captions and
spoken replies, masked provider-key settings, optional instructions links,
opt-in diagnostics, and an explicit session-ended state.

There is no walking intro or separate home typing bar. Typed input lives inside
Conversation. The native SVG companion uses layered shading, rim highlights,
specular lighting, glowing eyes and shaded feet, with independent IDs per instance.

Camera start and fullscreen never start the microphone. Mic off stops input;
spoken replies have their own setting. End session stops media, aborts work and
clears visual context. Start again returns to home with media off. It does not
reset the session allowance or erase the in-memory key.

Demo entry points, voice enrollment and speaker gating were removed from the
active companion. Old saved voiceprints do not affect this interface. The older
domain engine and research modules remain, with unit/HTTP coverage.

Movement questions can use the existing SAM recorded-clip endpoint from chat.
The local intent parser is intentionally narrow: common named objects and clear
movement requests, including a few English/Telugu patterns. It is not a general
LLM tool-calling system. Questions outside those patterns continue through the
normal assistant. Unclear objects are clarified. Valid fresh same-epoch recorded
results may be repeated; otherwise the UI asks for a new movement. No evidence
is invented for past movement that was not recorded.

The user explicitly presses Ready before recording. Analysis being enabled is
not consent to continuously track. The result stays in chat; the optional clip
viewer returns there. Clips remain in bounded transient browser memory, not
SQLite. Camera reset/session end clears the current playable clip.

Muse Image and Halloween look previews are not exposed as working features.
They remain design concepts for a future provider integration.

Browser tests use fake devices and mocked paid endpoints. They verify navigation,
permissions boundaries, recorded MP4 dispatch, voice streaming/fallback,
interruption, captions/settings and accessibility. Real-device acoustic accuracy,
SAM entitlement and live model quality are not certified by those tests.
