# Voice delay handling

Kokoro runs locally on the CPU. The October 31 test recorded speech requests
taking 4.3–41.3 seconds, including time waiting in the shared native queue.

Each request now has a four-second deadline, including queue wait. A timeout
uses the existing browser speech fallback and bypasses the local neural voice
for 60 seconds. The rest of that reply also uses the device voice. If the
device has no suitable speech voice, this fallback cannot guarantee audio.

Cancellation rejects the caller immediately, removes obsolete queued work,
and asks sherpa to stop at its next audio callback. Native computation inside
a single chunk can still continue; the serial lane stays occupied until it
actually finishes, preventing overlapping CPU jobs. Late audio is discarded.

Neural audio and browser fallback now share one playback queue, preserving
order when a later sentence falls back while earlier audio is still playing.

Successful `tts` timing records include `queueMs` and `generationMs`.
`tts-timeout` records report time spent in each stage up to the deadline.
These are server measurements, not confirmation that a phone played audio.

Regression tests cover stalled generation, cooldown and recovery, immediate
cancellation, no overlapping native jobs, and mixed neural/device playback.
No hosted speech provider or paid API is required for these changes.
