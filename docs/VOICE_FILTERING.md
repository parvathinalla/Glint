# Background voice filtering

Voice lock requires "Teach Glint your voice" on the device and browser being
used. Without a saved voiceprint, voice input remains unrestricted. Typed
questions do not require speaker verification.

With enrollment enabled, Glint waits for the local owner check before
interrupting an existing response, sending a recorded turn for transcription,
or dispatching a new reply. Live ASR can still receive audio while the person
is speaking; this is a reply gate, not an audio-upload privacy boundary.

Only an owner verdict permits dispatch. Stranger, missing, short, failed,
and timed-out checks do not. Checks have a three-second wait limit. The user
sees a prompt to speak a longer phrase, re-teach their voice, or turn off the
lock. An old check cannot submit a reply after cancellation or a newer send.

This intentionally changes short answers such as "yes": under 0.8 seconds of
voiced audio is insufficient for verification and is no longer automatically
accepted while voice lock is enabled. Initial model loading on a slow phone
can also require another attempt.

The current owner similarity threshold remains unchanged. It is not a
calibrated guarantee for all voices, languages, or mixed audio. This change
does not separate simultaneous speakers or prove performance equal to another
voice assistant. Real phone tests should include owner speech, background-only
speech, short answers, simultaneous speech, and ending voice chat during a check.

Automated tests use controlled speaker results to verify dispatch order and
rejection behavior; they do not measure acoustic recognition accuracy.
