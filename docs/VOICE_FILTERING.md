# Voice input on the conversation UI branch

Speaker enrollment and the voice-lock gate were removed from the consumer UI after testing showed valid owner turns being rejected. Existing saved voiceprints are ignored by this flow. The reusable speaker-model modules/tests remain for research, but are not imported by the active companion.

Input still uses browser echo cancellation/noise suppression, local voice activity detection, interruption handling and transcript echo checks. There is no dedicated background-voice isolation or simultaneous-speaker separation integration. Removing enrollment improves accessibility of short answers but does not prove background-speaker rejection.

Use the optional content-free voice diagnostics in Settings and the test matrix in VOICE_QUALITY_EVAL.md to compare actual phone behavior. Automated synthetic microphone tests verify flow, cancellation, fallback and playback events; they do not certify acoustic accuracy or production parity.
