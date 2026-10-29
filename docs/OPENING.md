# Glint opening sequence

October 28, 2026

The fresh-page greeting is a native SVG/CSS animation. Glint is larger and chubbier than the first design: a broad rounded spark body, soft cheeks, short rounded tips, the previously accepted substantial legs and shoes, and gentle gradient shading without a thin exterior outline. The shared in-site spark uses the same rounder silhouette.

## Timing

| Time | Visible action |
|---|---|
| 0–3.20 seconds | Only Glint on a quiet warm background. She enters in a distinct right-facing profile, waddling horizontally with alternating feet, weight shifts, and a grounded shadow. |
| 3.20–3.55 seconds | She stops at the center and settles. |
| 3.55–4.17 seconds | One stable body retains its shape while the facial pose turns forward. The near eye stays anchored and the far eye becomes visible. |
| 4.17–4.50 seconds | A clear, fully front-facing beat before any light starts. |
| 4.50–5.45 seconds | One huge radial bloom with a bright ivory core, blue halo, visible falloff and one expanding ring reaches the screen edges. She remains visible through the peak rather than leaving a blank hold. No strobe or abrupt white flicker. |
| 5.45–6.10 seconds | The full-screen light dissolves and the existing website gently appears. |
| After 6.10 seconds | Intro is removed, site controls become active, and focus moves to the main content. |

The website remains visually hidden before the reveal and `inert`/hidden from assistive technology until the sequence finishes. A discreet Skip intro control appears on keyboard focus or hover; Escape also skips. Reduced-motion preference bypasses walking and light immediately. Changing that preference during the intro also finishes it. Timers and event handlers are cleaned up on completion or unmount.

## Session policy

The intro runs once per full document load, including a deliberate refresh. It does not use browser storage, reset task state, remount the app after the reveal, or replay on in-app navigation or WebSocket reconnects. Normal app source/progress recovery remains responsible for refresh behavior. The intro itself never starts camera/microphone capture, submits a key, or dispatches a model request.

## Implementation and evidence

- `src/Opening.tsx`: phase sequence, accessibility, cleanup, and separate front-facing beat.
- `src/OpeningCharacter.tsx`: unified SVG shell, inset facial poses, original leg/shoe artwork, requestAnimationFrame gait, ground-contact compensation, and stable turn.
- `src/opening.css`: face transitions, viewport-level bloom, and reveal.
- `src/Art.tsx`: matching rounder shared avatar from the preceding redesign; unchanged in the anatomy correction.
- `src/main.tsx`: wraps the existing app without changing its lifecycle.
- `src/App.tsx`: main content can receive focus after reveal.
- `tests/e2e/opening.spec.ts`: ordering, hidden/inert site, fresh-load policy, no media/paid actions, desktop/mobile overflow, reduced motion, keyboard skip, screenshots, and a browser recording.
- Existing workspace tests explicitly wait for the intro to finish.

Current screenshot and recording evidence is in ignored `test-results/`, including `glint-opening-01-profile-desktop.png`, `glint-opening-02-centered-desktop.png`, `glint-opening-03-light-desktop.png`, `glint-opening-04-revealed-desktop.png`, corresponding mobile frames, and `glint-opening-desktop.webm`. These contain only original Glint art and synthetic example UI. No external animation service or new runtime dependency was added.

## Profile and turn correction

Latest side-view refinement: both legs use matched substantial proportions with rounded upper joins and the established shoe style. The side-view eye is rounder and remains anchored/inset. Original frontal eye and leg paths are restored through the turn, so these side-view changes do not redesign the front-facing character. Seven time-stepped desktop/mobile gait frames cover contact and swing.

The reported malformed view came from the old pointed underside, edge-positioned profile features, and two independently compressed body/face layers. The corrected intro has one rounded shell, a comfortably inset three-quarter face, and a fixed near eye through the turn. The user-preferred prior leg and shoe artwork is retained. Each foot has a separate stance/swing calculation with fixed ground contact while planted; both remain layered behind the belly. No scaleX squeeze is applied to shell or face.

The final light treatment uses a bright ivory core with a contrasting blue halo and falloff. It keeps Glint visible through the peak and dissolves over the website, avoiding a washed-out cream hold. The light is a viewport-level sibling of the avatar, so the SVG viewBox cannot clip it. It expands once using a soft circular reveal, holds at the screen edges, and dissolves into the site after the frontal beat.

## Current material-only version

The earlier compact SVG rig and original leg artwork are restored, superseding the stance/swing experiment above. The existing small alternating waddle and turn remain. Clipped highlights, luminous blue edges, tiny bubbles and three subtle sparkles add a jelly-like finish without changing the star's silhouette. This is layered SVG shading, not physically refractive 3D. The experimental Three.js implementation and dependencies have been removed.

`tests/e2e/opening-rig.spec.ts` checks finite moving transforms and one unsquashed shell through the turn. Seven time-stepped gait crops are captured for desktop and mobile; live-timed midpoint, front-facing beat, huge-bloom, and reveal screenshots plus the browser recording verify the transition.

The header uses the existing small smiling blue star companion from `Art.tsx`, replacing the plain four-point sparkle. The home page removes the collapsed sidebar, breadcrumb and promotional hero in favor of the task input and optional example.

## Blue material update

The shared companion and intro material are now blue at the user’s request. Geometry, facial artwork and rig are unchanged. Material highlights, feet and the intro bloom use a coherent blue palette. Intro screenshots and the browser recording now use a controlled Playwright clock to capture brief phases reliably; they are not real-time performance measurements.
