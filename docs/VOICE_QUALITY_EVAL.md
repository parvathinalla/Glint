# Voice quality: measurement before provider selection

## Record a test

Open **Voice test diagnostics**, then enable **Record and share voice
diagnostics**. This is off on every page load. Events remain in memory, capped
at 120, and are sent in batches of at most 30 every five seconds. Download the
JSON before refreshing. Turning recording off stops new recording and discards
unsent batches; a download still contains the retained events.

Shared server log entries start with `[glint-client-voice]`. The authenticated,
CSRF-protected endpoint accepts only fixed event/reason names and bounded
numbers. It rejects arbitrary fields, limits each session to 360 events/minute,
and does not dispatch model calls or consume the 100-call provider allowance.
Failed batches are not retried automatically. The local download is still
available. Local downloads and server logs remain until deleted by their owner.

There is no transcript, audio, image, voiceprint, similarity vector, key, URL or
user identifier in the diagnostic payload. Turn numbers are page-local, not
global identities. Do not interpret transport closures as a confirmed failure
without context.

## What playback evidence means

`audio-received` means the browser received PCM. `audio-scheduled` means Web
Audio accepted scheduling while its context was running. It does **not** prove
the output was audible. `playback-blocked` means it was scheduled while the
context was not running. `device-playback-start` is emitted by the browser's
speech utterance start callback, rather than by enqueueing speech.

Playback event durations measure from the detector delivering the completed
turn to scheduling/start. They exclude endpoint detection delay. A complete
end-of-speech latency benchmark still requires a known acoustic speech endpoint
and an output capture or manual playback check. Do not report this preliminary
metric as proof of the full two-second target.

## Repeatable test matrix

Use the same recorded test material, speaker distance, playback volume, phone,
network condition and language for each candidate pipeline. Never silently
change these between comparisons. Begin with a controlled baseline, then run
the same tests through each voice-isolation/transcription/speech candidate.

| Scenario | Repeatable setup | Check |
| --- | --- | --- |
| quiet | Owner asks a full question in a quiet room | Accept and answer accurately |
| noise | Same question with a fixed fan/traffic recording | Preserve the words |
| background | Play another speaker/TV, owner silent | No unwanted response |
| overlap | Owner and another voice speak together | Preserve owner or ask to repeat; no confident invented question |
| short | Owner says yes/no and short Telugu replies | Natural short replies work with the intended production settings |
| network | Same question with a fixed throttling/disconnect profile | Recover without duplicate or truncated answers |

Cover Telugu, English and mixed speech on Android and iPhone. The conversation
UI removes enrollment and ignores old voiceprints. Short answers must be tested
without a speaker gate. Dedicated acoustic voice isolation is not yet integrated.

Additional manual cases: interrupt a long reply; make a brief non-speech sound;
lock/unlock the phone; switch tabs; revoke mic permission; leave idle camera
observation running. Check both unwanted interruptions and missed genuine ones.

## Score labeled turns

Create one case per turn, copying only that turn's diagnostic events. Label the
scenario, language, device and whether a reply was expected. Example structure
(illustrative measurements only):

```json
{
  "cases": [{
    "scenario": "quiet",
    "language": "telugu",
    "device": "android",
    "expectedReply": true,
    "events": [
      {"turn": 1, "stage": "speech-end", "elapsedMs": 1000},
      {"turn": 1, "stage": "reply-dispatched", "elapsedMs": 1100},
      {"turn": 1, "stage": "audio-scheduled", "elapsedMs": 2500, "durationMs": 1500}
    ]
  }]
}
```

Run `npx tsx scripts/evaluate-voice.ts labeled-voice-cases.json`.

The preliminary gate requires at least 100 labeled owner turns, 100 background
turns, 20 cases per scenario and coverage of all listed languages/devices.
It checks owner dispatch acceptance >=95%, background false activation <5%,
and detected-turn-end-to-browser-audio p95 <=2 seconds. Missing measurements or
coverage never pass. The sample above is intentionally insufficient.

This is an initial screening gate, not a production certification. Production
approval additionally requires transcript accuracy, audible output, interruption
stop latency, load/cost, data handling, and recovery validation. Keep test audio
outside the repository, with permission from its speakers; the scorer requires
no speech content. No acoustic corpus or paid provider evaluation has been run
as part of the implementation tests.
