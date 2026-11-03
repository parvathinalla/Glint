# Glint navigation concepts — version 2

Generated with the built-in image generation tool. Proposed UI only; no application code changed. Supersedes the first presentation boards for navigation review.

User changes: remove Try a demo; remove speaker training, enrollment, and voice-lock UI. Make transitions, state changes, return paths and future-only features explicit.

## Screens and routes

| Screen | Action | Destination / behavior |
| --- | --- | --- |
| 01 Intro | Start Glint / Skip intro | 02 Companion home |
| 01 Intro | Help (?) | Permission/help explanation overlay; close stays on 01 |
| 02 Home | Talk | Request mic permission if needed; Listening state on 02 |
| 02 Home | Camera | Request camera permission if needed; 03 Camera |
| 02 Home | Conversation | 04 sheet over Home |
| 02 or 03 | Settings | 06; remember originating screen |
| 02, 03, 05 | End session | Stop camera/mic and all outstanding work; 09 |
| 03 Camera | Expand | 05 Fullscreen camera |
| 03 Camera | Mic / Flip | Toggle mic / switch camera; remain on 03 |
| 03 Camera | Conversation | 04 sheet over Camera |
| 03 Camera | Track object | 07 |
| 04 Conversation | Close X | Return to originating screen, 02 or 03 |
| 04 Conversation | Open camera | 03 |
| 04 Conversation | Type + Send / mic | Stay on 04; update conversation or mic state |
| 05 Fullscreen | Back | 03 |
| 05 Fullscreen | Mic / Flip | Remain on 05; update mic/camera state |
| 06 Settings | Back | Return to originating screen |
| 06 Settings | Theme System/Light/Dark | Apply appearance across all screens; remain on 06 |
| 06 Settings | Language / captions / diagnostics | Inline option or toggle on 06 |
| 06 Settings | About models | Expand model information on 06 |
| 06 Settings | SAM toggle | Enable feature only; do not start recording |
| 06 Settings | Open tracking | 07 |
| 06 Settings | Look previews | Future-feature information overlay; not an active generation request |
| 07 Tracking | Record 2-second clip | Recording then analyzing states on 07; success opens 08 |
| 07 Tracking | Cancel | Stop/discard current recording or cancel analysis; ready on 07 |
| 07 Tracking | Back | Cancel unfinished work; 03 |
| 08 Result | Record again / Retry | 07 |
| 08 Result | Back / Back to camera | 03 |
| 09 Ended | Start again | 02, with camera and mic off until explicitly started |
| 09 Ended | Home | 01 |
| 04 Conversation | Ask for a creative look | 10, future concept only |
| 10 Consent | Style choice | Update choice on 10 |
| 10 Consent | Yes, choose a photo | 11 |
| 10 Consent | No, just ideas | 04; continue with text ideas, no photo capture |
| 10 Consent | Navigation menu | Inline quick links: Home 02, Camera 03, Settings 06 |
| 10 Consent | Companion / Conversation / Settings | 02 / 04 / 06 |
| 11 Editor | Take photo / Choose photo / Replace photo | Explicit device capture or picker, return to 11; cancellation preserves existing selection |
| 11 Editor | Outfit / Makeup / Accessories / Background | Inline editing controls on 11 |
| 11 Editor | Generate preview | 12 |
| 11 Editor | Close | 04; discard unsubmitted edits |
| 11 Editor | Settings gear | 06; Back returns to 11 with unsent draft retained |
| 12 Generating | Cancel / Back | Cancel job and ignore late results; 11 |
| 12 Generating | Complete | 13 |
| 12 Generating | Error: Retry / Edit | 12 / 11 |
| 13 Result | Before / After | Switch image on 13 |
| 13 Result | Edit look / Try another look | 11 |
| 13 Result | Save image | Explicit save; stay on 13 with confirmation |
| 13 Result | Back to Glint | 04 |

Background controls behind an open modal sheet are not interactive. Microphone-off never shows Listening. If a permission is denied, stay on the originating screen with recovery help. SAM remains experimental recorded-clip movement, not continuous live tracking. Muse Image is planned, not implemented.

## Prompt set

### 01-main-navigation

Use case: ui-mockup. Redesign the attached Glint UI concept into an explicit, extremely clear NAVIGATION SPECIFICATION BOARD rather than a marketing poster. This board is for reviewing exactly what happens when buttons are tapped. Use a clean flat pale blue-white canvas, no photographic backdrop, no decorative desk, no cinematic phone perspective. Straight front-on readable tall mobile screen frames. Preserve Glint's adorable blue star, cobalt/cyan accents, simple modern typography and optional light/dark themes. Independent app built using Meta models. No unsupported Llama mention or official partnership/endorsement. Crucial user corrections: DELETE "Try a demo" completely; DELETE speaker voice training, voice enrollment, voice lock, teaching voice and related settings completely. Do not include those features anywhere in the board. Focus on navigation, legibility, visual order, generous arrow space and complete visible phone screens. Each screen needs a large stable numbered screen ID outside its frame. Every interactive control should have a small external routing note with screen ID or a state-change explanation. All arrows must have action labels, never just decorative direction arrows. Use the exact screen IDs and routing below; screen IDs continue across three boards. No browser chrome or bottom OS cut-off. No fake latency, percent confidence, data-security promises, imaginary spatial mapping, Memories, Library or demo links. Light theme warm white, dark charcoal; same blue-star brand throughout. All text English. Generate a wide high-resolution landscape board with crisp legible text. Keep tiny provider attribution once in the footer rather than repeatedly in the main UI.
Title "GLINT · MAIN NAVIGATION". Subtitle "What happens when you tap". Layout FIVE numbered phone screens in left-to-right sequence with clear labeled connectors and a concise routing strip below; maximize screen height while leaving enough room for real arrows. Label A small "Proposed UI".
01 INTRO: blue star walking and shining shown in a little 3-position motion trail, one heading "A clearer next step." ONE primary button "Start Glint". A small "Skip intro" text also goes to screen02. No demo button, no extra secondary CTA.
02 COMPANION HOME: white screen blue star central, neutral "Ready" status, question "What can I help you with?" Bottom controls "Talk", "Camera", "Conversation"; gear icon labeled "Settings". End session text at top. Talk changes THIS screen to Listening (not another screen); Camera opens03; Conversation opens04; Settings opens06 on next board; End session goes09 on next board.
03 CAMERA: light theme camera preview of a monitor rear with ports. Clear status "Camera on · Mic off". One task caption "Show me the ports on your monitor." Below controls "Mic", "Flip", "Conversation", plus visible "Track object" action. On camera preview itself a visible fullscreen-corners button labeled "Expand". Mic changes listening on/off on same screen; Flip switches front/back without navigation. Conversation goes04, Expand goes05, Track object goes07 on next board. End session goes09.
04 CONVERSATION SHEET: previous home/camera behind a conversation bottom sheet. Close X clearlyvisible. User "Which cable should I use?" assistant "Bring the camera closer to the port labels." Message input and Send, miccontrol. X closes sheet and returns to whichever screen opened it,02 or03. "Open camera" goes03. Sending a message stays04.
05 FULLSCREEN CAMERA: camera fills screen, clear Back chevron, small transcript caption, mic and flip controls, no giant star. Back goes03. Mic and Flip stay05. End session goes09.
Draw obvious blue connectors from StartGlint01 to02 labeled "Tap Start"; from Camera02 to03 "Tap Camera"; from Conversation03 to04 "Tap Conversation"; from Expand03 to05 "Tap Expand". If arrows cross, use numbered routing notes instead of ambiguous crossing lines.
Bottom navigation key must read, in compact readable columns:
"01 Start / Skip → 02"
"02 Talk → Listening on 02"
"02 Camera → 03 · Conversation → 04 · Settings → 06"
"03 Expand → 05 · Track object → 07"
"04 Close → previous screen · 05 Back → 03"
"End session → 09"
Small permissions note below: "First use: request microphone only for Talk; camera only for Camera. Allow → continue; Deny → stay on current screen with recovery help."
Footer "Built with Meta models · Muse Voice Transcribe: speech · Muse Spark: scene understanding".
The screen images and the navigation key must agree exactly. Priority is readable navigation, not decorative composition.

### 02-settings-tracking-navigation

Use case: ui-mockup. Redesign the attached Glint UI concept into an explicit, extremely clear NAVIGATION SPECIFICATION BOARD rather than a marketing poster. This board is for reviewing exactly what happens when buttons are tapped. Use a clean flat pale blue-white canvas, no photographic backdrop, no decorative desk, no cinematic phone perspective. Straight front-on readable tall mobile screen frames. Preserve Glint's adorable blue star, cobalt/cyan accents, simple modern typography and optional light/dark themes. Independent app built using Meta models. No unsupported Llama mention or official partnership/endorsement. Crucial user corrections: DELETE "Try a demo" completely; DELETE speaker voice training, voice enrollment, voice lock, teaching voice and related settings completely. Do not include those features anywhere in the board. Focus on navigation, legibility, visual order, generous arrow space and complete visible phone screens. Each screen needs a large stable numbered screen ID outside its frame. Every interactive control should have a small external routing note with screen ID or a state-change explanation. All arrows must have action labels, never just decorative direction arrows. Use the exact screen IDs and routing below; screen IDs continue across three boards. No browser chrome or bottom OS cut-off. No fake latency, percent confidence, data-security promises, imaginary spatial mapping, Memories, Library or demo links. Light theme warm white, dark charcoal; same blue-star brand throughout. All text English. Generate a wide high-resolution landscape board with crisp legible text. Keep tiny provider attribution once in the footer rather than repeatedly in the main UI.
Title "GLINT · SETTINGS, TRACKING & EXIT". Subtitle "Screen IDs continue from the main navigation board." FOUR numbered front-on mobile screens in a single horizontal row, with whiteboard arrows and explicit button routing. Leave enough whitespace below for a clear navigation matrix.
06 SETTINGS: start in dark theme, Back top-left. Header Settings. Section Appearance with System / Light / Dark segmented control and tiny side-by-side preview swatches. Clicking a theme changes the current screen, does not navigate. Rows Language "English + Telugu"; Captions switch; "Object tracking (SAM)" enable toggle; visible "Open tracking" button; "Look previews" with "Future feature"; "Voice diagnostics" toggle off; "About the models". NO voice lock, speaker training, voice enrollment or demo rows. Back returns to previous screen02or03; Open tracking goes07. Enabling SAM does not start recording automatically.
07 RECORD OBJECT MOVEMENT: dark screen, header Back and "Track an object". Small tag "SAM 3.1 · experimental recorded clip". Object text field "Computer mouse". Camera photo with a hand on mouse. Text "Keep the camera still. Move the mouse while recording." Primary "Record 2-second clip". A small in-screen state strip "Ready → Recording (2s) → Analyzing". Cancel button during recording/analysis returns to ready state07. Successful analysis goes08. Back returns03. This is NOT continuous live object tracking; no live detection boxes.
08 TRACKING RESULT: dark screen, header "Recorded result". A captured-clip thumbnail and clear text "Mouse moved right" with qualifier "Relative to the camera". Buttons "Record again" and "Back to camera". Record again goes07. Back to camera goes03. Failed/uncertain result can show a small alternate-state callout "Could not confirm movement · Retry → 07", not fake confidence.
09 SESSION ENDED: LIGHT screen, blue star seated calm. Title "Session ended". Text "Camera and microphone are off." ONE primary button "Start again" going02. Secondary "Home" going01. Do not show a phone-call red hangup icon.
Draw connectors directly tied to actual controls: Settings06 Open tracking→07; Record07 successful completion→08; Result08 Record again→07 as a return arrow. Endsession09 is a separate route from main screens, show an incoming arrow labeled "End session from 02, 03 or 05" instead of pretending Settings leads to Ended.
Bottom routing matrix:
"06 Back → previous screen"
"06 Theme → update all screens"
"06 SAM toggle → enable only; Open tracking → 07"
"07 Record → Recording → Analyzing → 08"
"07 Cancel → Ready on 07 · Back → 03"
"08 Record again → 07 · Back to camera → 03"
"09 Start again → 02 · Home → 01"
Small future cross-board note: "Look-preview consent begins in Conversation04 → 10."
Footer "Meta models: Muse Spark understands scenes; SAM 3.1 analyzes recorded movement."
No incorrect routing; focus on exact button destinations.

### 03-future-creative-navigation

Use case: ui-mockup. Redesign the attached Glint UI concept into an explicit, extremely clear NAVIGATION SPECIFICATION BOARD rather than a marketing poster. This board is for reviewing exactly what happens when buttons are tapped. Use a clean flat pale blue-white canvas, no photographic backdrop, no decorative desk, no cinematic phone perspective. Straight front-on readable tall mobile screen frames. Preserve Glint's adorable blue star, cobalt/cyan accents, simple modern typography and optional light/dark themes. Independent app built using Meta models. No unsupported Llama mention or official partnership/endorsement. Crucial user corrections: DELETE "Try a demo" completely; DELETE speaker voice training, voice enrollment, voice lock, teaching voice and related settings completely. Do not include those features anywhere in the board. Focus on navigation, legibility, visual order, generous arrow space and complete visible phone screens. Each screen needs a large stable numbered screen ID outside its frame. Every interactive control should have a small external routing note with screen ID or a state-change explanation. All arrows must have action labels, never just decorative direction arrows. Use the exact screen IDs and routing below; screen IDs continue across three boards. No browser chrome or bottom OS cut-off. No fake latency, percent confidence, data-security promises, imaginary spatial mapping, Memories, Library or demo links. Light theme warm white, dark charcoal; same blue-star brand throughout. All text English. Generate a wide high-resolution landscape board with crisp legible text. Keep tiny provider attribution once in the footer rather than repeatedly in the main UI.
Title "GLINT · OPTIONAL LOOK PREVIEW". Prominent subtitle "FUTURE CONCEPT · Muse Image integration planned". This board must make branching, cancel and return navigation visible, not just show an aspirational result. FOUR numbered full phone screens left-to-right with enough space for labeled arrows. Use one consistent adult South Asian woman across photo/editor/generated preview. Same face and skin tone, tasteful fantasy moon-witch makeup, navy cape and hat, nonsexual, natural realistic photograph. Preserve Glint's star rather than replacing it with a human assistant.
10 CONSENT IN CONVERSATION: light screen, Glint chat. User "Which Halloween look should I try?" Assistant "What style do you like?" chips Playful / Spooky / Fantasy. Then "Would you like a preview on your photo?" Buttons "Yes, choose a photo" and "No, just ideas". YES arrow to11. NO branch is a big visible labeled return arrow to "04 Conversation: continue with text ideas". User choosing No must NOT enter photo editor. Photos are never automatically captured.
11 PHOTO & EDITOR: dark screen. Back/Close top-left, title "Create your look". Explicit "Take photo" and "Choose photo" actions, realistic original woman photo shown only AFTER user selection. "Replace photo" link. Options Outfit / Makeup / Accessories / Background. Prompt "Moon-witch costume, silver makeup, navy cape". Primary "Generate preview"→12. Close→04. Photo choosing uses device picker and returns11; no additional product screen implied.
12 GENERATING: light screen, selected photo with subtle progress treatment NOT finalgeneratedimage. Text "Creating your preview…" and "You can cancel." ONE visible "Cancel" button→11. Completion arrow→13. Small error alternate-state callout belowphone: "Generation failed: Retry → 12; Edit → 11". No pretendinstantproviderperformance.
13 RESULT: dark screen, same woman transformed with moon-witch outfit. Label "AI preview". Before/After tabs and visible selectedAfter. Buttons "Edit look"→11, "Save image" stays13 with Saved confirmation. Top-left "Back to Glint"→04. Secondary "Try another look"→11. No automatic sharing or saving, no personality/attractiveness judgments.
Arrows:10 YES→11→12→13 across tops, 10 NO→04 clearly branches below without going through11;12 Cancel→11 returnarrow;13 Edit→11 returnarrow;13 BacktoGlint→04 destinationlabel. Use actual button names, not generic "next".
Routing matrix at bottom:
"04 Ask about a look → 10"
"10 Yes → 11 · No → 04"
"11 Take/Choose photo → device picker → 11"
"11 Generate → 12 · Close → 04"
"12 Cancel → 11 · Complete → 13"
"13 Edit / Another look → 11"
"13 Save → stay on 13 · Back to Glint → 04"
Footer "Proposed flow only · Muse Image is a planned integration · user consent before photo selection".
No speaker-training or demo features anywhere.

## Main-board correction prompt

Use case: precise-object-edit. Correct ONLY the navigation annotation errors in the provided GLINT MAIN NAVIGATION board. Preserve all five phone screen layouts, images, star brand, colors, labels, typography, and bottom navigation key, except the specific corrections below.
1. Above screen02, the callout "Tap Settings" incorrectly says arrow09. Change its destination to EXACTLY "→ 06". Keep the neighboring "Tap End session →09" callout unchanged.
2. Between screen03 and screen04, the callout directly beside screen03's fullscreen-corners Expand icon incorrectly says "Tap Conversation →04". Change THAT callout to "Tap Expand →05". It should remain attached to the fullscreen-corners icon. The separate callout below the Conversation button must stay "Tap Conversation →04".
3. Under screen05 FULLSCREEN CAMERA, the Mic callout incorrectly says "Stays on 03". Change it to EXACTLY "Stays on 05". The complete callout should read "Tap Mic (on/off) / Stays on 05 / (toggles mic)". Keep the neighboring Flip callout "Stays on05" unchanged.
4. Under screen04, the two callout arrows are swapped. The callout "Type and tap Send (stays on04)" must point to the Send button. The callout "Tap Open camera →03" must point to the big Open camera button. Reposition just the connector strokes as needed so each labels its actual button.
5. The small top gear on screen03 should have a tiny nearby note "Settings →06" if this fits without overlapping; otherwise leave the icon without another label because the main routing key already explains Settings06.
Do not change any other destinations or create extra controls. No demo or voice training features. Confirm that the corrected destinations agree with the existing bottom routing key: Settings06, Expand05, Fullscreen mic stays05. Preserve full board uncropped.
