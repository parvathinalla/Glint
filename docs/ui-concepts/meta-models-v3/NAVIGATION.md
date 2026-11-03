# Glint: conversation-first UI, version 3

Proposed UX images generated with the built-in image-generation tool. These supersede version 2's separate tracking and look-editor flows. No application code has been changed.

## Interaction rules

- Start opens Companion home A. Talk stays on A with Listening state; Camera opens B; Conversation opens C.
- Camera B supports mic toggle, flip and fullscreen without changing the conversation. Its Conversation control opens C.
- Conversation C is the entry point for user-requested object analysis and look previews. Results return in C; no dedicated tool menu, object-name setup, or mandatory full-page image editor.
- Settings D returns to the originating screen. Permissions do not start tools automatically.
- End session stops microphone, camera and outstanding work; Start again returns A.

### Tracking T1–T4
T1: A natural user request initiates an evidence check. With valid recent evidence, answer directly in chat (T3). Without it, ask the user to repeat the movement. Ready starts short-clip capture T2; Not now stays in conversation.
T2: Recording and analysis are inline chat-card states. Cancel returns to chat without an invented result. Success shows T3.
T3: A camera-relative recorded-motion answer and clip thumbnail appear in chat. Check again returns to a readiness state, not automatic recording. View clip opens optional T4.
T4: Recorded clip detail; Back returns T3.
Camera-off and ambiguous-object questions are resolved in conversation before capture. Failure or uncertain evidence produces an honest retry prompt.
The current implementation supports short new clips. Conversation-driven orchestration and reuse of appropriate evidence are proposed UX, not implemented claims.

### Look preview L1–L4 — future
L1: Respond to the user's Halloween-look request with ideas and offer to show the look. Yes leads to L2; No continues text suggestions in chat.
L2: Ask permission to use an already-shared photo, or explicitly take/choose one. Use this photo starts L3. Cancel continues conversation without generation.
L3: Inline generation card. Cancel returns to L2 with selected photo retained; failure offers retry or continued chat. Success adds the generated image to the conversation in L4.
L4: The edited image is the answer. Change makeup, Change outfit and Try another look request an adjustment in chat and regenerate with L3. Save is explicit and stays in chat. Tapping the image opens optional fullscreen detail; closing returns to the same image message.
Muse Image remains a planned integration. No attractiveness ranking or appearance-based personality inference.

## Removed
No Try a demo, speaker enrollment/training, voice lock, dedicated tracking launch page, or mandatory look editor.

## Generation prompts

### Main navigation
Use case: ui-mockup. Redesign the attached Glint MAIN NAVIGATION board to be CONSISTENT with conversation-triggered object tracking and optional look previews. This is a proposed UX, not implemented product screens. Preserve the blue star identity, white/cobalt/cyan palette and crisp accessible mobile UI. No demo, no voice training/enrollment/voice lock. No manual Track object button, no tool-launch page, no Look tool button, no object-name setup. Those features are requested naturally through voice or text; results appear inside the same conversation.
Make a clean wide 16:9 whiteboard-style navigation diagram with FOUR full upright phone screens and clear numbered headings, short labeled arrows and a readable routing key. Use short copy, no crowded paragraphs. No photographic backdrop. A small INTRO strip at top-left shows blue star walking/shining with "Start Glint → Home", no secondary demo button.
PHONE A label "A · COMPANION HOME": light theme. Header blue star Glint, settings gear, "End session". Hero blue star, status Ready, "What can I help you with?" Three bottom controls "Talk", "Camera", "Conversation". Talk toggles Listening on A; Camera→B; Conversation→C; Settings→D; Endsession→simpleendedstate withmiccameraoff, outsideboard smallcallout.
PHONE B label "B · CAMERA": large livecamera realphoto mouseonwoodendesk. Top "Camera on · Mic off". One simple caption "What would you like to check?" Bottom only "Mic", "Flip camera", "Conversation". Camera preview has Expand corners. Mic toggleslisteningonB;FlipstaysB;Conversation→C;Expandfullscreenoverlay with Back→B. NO trackingbutton, no fake detections. A small Glint assistantbubble "Ask me about what you see." Header Back→A, Settings→D.
PHONE C label "C · ONE CONVERSATION": SAMEchatcanusecameraorvoice. User asks "Which way did I move the mouse?" Assistant asks "Hold the camera still and move it again when you're ready." An inline small capturecard "Ready — check movement", secondary "Not now", and small resultbelow "Recorded result: moved right" as a clearly marked alternate state, not recordingalreadydone. Normalcomposerandmic. Small callout OUTSIDEphone "Movement request → tracking flow T1–T4". Another OUTSIDEphone smallcallout "Halloween look request → preview flow L1–L4 (future)". Do not add special launch buttons for these tools. Close returns originatingAorB. Feature results stay C.
PHONE D label "D · SETTINGS": dark theme. Backreturnsoriginatingscreen. Appearance System/Light/Dark, Language English+Telugu, CaptionsOn, "Allow object analysis" toggleOn with help "Only when you ask"; "Look previews" with badge "Future feature" and help "Offered in conversation"; Voice diagnosticsOff; Aboutthemodels. NO Open tracking button. NO voice lock. Theme changes currentpageandallotherpages, no navigation.
Arrowconnectors ACamera→B, BConversation→C, SettingsfromA/B/C→D; use labeled routekeyratherthancrossingifspace.
Bottom routekey exactly:
"Start → A"
"A: Talk = listening · Camera → B · Conversation → C"
"B: Conversation → C · Expand = fullscreen · Back → A"
"C: Close → previous screen · tool results stay in chat"
"Settings → D · Back → previous screen"
"End session → camera + mic off → Start again → A"
Footnote "Object tracking: recorded clip analysis. Look previews: future Muse Image integration. No feature runs solely because it is enabled."
Footer "Built with Meta models · Muse Voice Transcribe · Muse Spark · SAM 3.1 · Muse Image (planned)".
No unsupported Llama or official partnership claim. Prioritize consistent routing and legibility over decorative elements.

### 01-conversational-tracking
Use case: ui-mockup. Create a high-resolution Glint conversational mobile UX navigation board, not a marketing poster. References show the visual brand ONLY; fundamentally replace their separate tool-screen navigation with conversation-first interactions. Clean pale neutral canvas, four complete front-facing mobile screens in a horizontal row, numbered state labels above, explicit action arrows between screens, concise return/cancel routing below. Plenty of whitespace, large readable English text, cobalt-blue/cyan accents, warm white or charcoal dark themes. Consistent lovable blue star companion. Every phone is the SAME Glint conversation progressing, not four separate tools. Header only Glint, small star, back button where appropriate, unobtrusive settings. Bottom composer always available unless a native photo picker is open. No demo, voice training, enrollment, voice lock, Memories or Library. No separate Track object page or forced image editor. No task menu, typed object-name setup, provider setup, or automatic image capture. Labels "Proposed conversational UI" outside phones. Avoid unsupported claims, fake certainty, physical-world coordinates or invented capabilities. Small model attributions meaningful but secondary, no fake Meta affiliation. Keep images and screen contents clear; arrows must match the actual actions.
Title "GLINT · ASK ABOUT MOVEMENT". Subtitle "Ask naturally. Glint checks evidence. The answer stays in chat."
Screen 1 label "T1 · USER ASKS": warm white Glint conversation with small camera preview of a desk and computer mouse at top. User bubble EXACTLY "Which way did I move the mouse?" Glint reply EXACTLY "I don't have a recording of that movement. Hold the camera still and move the mouse again." Inline action "Ready — check movement" and secondary "Not now". NO claim to know the previous direction. Small note underneath "Recording starts only when you’re ready." Ready arrow toT2; Notnow staysT1 conversation. Tiny alternative branch OUTSIDEphone: "Valid recent evidence? Answer in chat directly → T3; no re-recording needed." This direct route is conditional, not evidence invented for the illustrated example.
Screen2 label "T2 · CAPTURE IN CHAT": SAME conversation and existing messages preserved. Inline camera card with mouse and hand, a visible two-second timeline, status "Recording movement · 2s", supporting "Keep the camera still." Inline Cancel. Below a little state transition text "Recording → Analyzing movement…" Progress animation is in the card, not a new page. No directional arrow until evidence exists. Cancel returns to conversationT1 without a result. A clear completion connector "Analysis complete" toT3.
Screen3 label "T3 · ANSWER IN CHAT": SAME conversation, user question still visible. Glint bubble "The mouse moved right in this recording, relative to the camera." Inline evidence thumbnail shows before/after mouse positions with a rightward arrow marked "Recorded clip". Small tag "SAM 3.1 · experimental clip analysis". Buttons "View clip" and "Check again". Normal text composer "Ask a follow-up…" visible. T3Viewclip→T4; Checkagain→T2 readiness, not auto record; typedfollowup stayschatT3.
Screen4 label "T4 · OPTIONAL CLIP DETAIL": dark larger recorded clip viewer opened ONLY after user taps Viewclip. Header "Recorded movement", Back button "Back to chat". Timeline0:00–0:02, before/after indicators and camera-relative rightward arrow. Title "Mouse moved right", supporting "Camera-relative recorded result". Back→T3. Do not suggest continuous tracking. No live detections.
Bottom routing key compact:
"Ask → check available evidence"
"Missing evidence → ask to repeat → Ready → record 2s → analyze"
"Result appears inside the same conversation"
"View clip → optional detail · Back → chat"
"Cancel / Not now → continue chatting"
Small exception strip: "Camera off → ask to open camera, then return to capture. Object unclear → ask 'Mouse or cable?' No clear movement → say uncertain and offer retry."
Footer "Proposed UX; current SAM integration uses new short clips. Conversation-triggered orchestration is proposed, not implemented."
Use arrows that point from the actual inline buttons rather than generic separate-settings navigation.

### 02-conversational-look-preview
Use case: ui-mockup. Create a high-resolution Glint conversational mobile UX navigation board, not a marketing poster. References show the visual brand ONLY; fundamentally replace their separate tool-screen navigation with conversation-first interactions. Clean pale neutral canvas, four complete front-facing mobile screens in a horizontal row, numbered state labels above, explicit action arrows between screens, concise return/cancel routing below. Plenty of whitespace, large readable English text, cobalt-blue/cyan accents, warm white or charcoal dark themes. Consistent lovable blue star companion. Every phone is the SAME Glint conversation progressing, not four separate tools. Header only Glint, small star, back button where appropriate, unobtrusive settings. Bottom composer always available unless a native photo picker is open. No demo, voice training, enrollment, voice lock, Memories or Library. No separate Track object page or forced image editor. No task menu, typed object-name setup, provider setup, or automatic image capture. Labels "Proposed conversational UI" outside phones. Avoid unsupported claims, fake certainty, physical-world coordinates or invented capabilities. Small model attributions meaningful but secondary, no fake Meta affiliation. Keep images and screen contents clear; arrows must match the actual actions.
Title "GLINT · SHOW ME MY HALLOWEEN LOOK". Prominent subtitle "FUTURE CONCEPT · Muse Image integration planned". Supporting "A helpful suggestion becomes a personal preview, inside the conversation."
Use four states of SAME conversation, alternating light/light/dark/light themes just for showing theme support, not suggesting theme changes while navigating. Adult South Asian woman with same face, age, skin tone and facial features in original/edited pictures; realistic tasteful navy moon-witch cape/hat and silver eye makeup, nonsexual.
Screen1 label "L1 · ASK & OFFER": Glint conversation user "Which Halloween look would suit me?" Assistant "A moon-witch look could be fun: a navy cape, silver makeup and moon accessories." Then "Want me to show you how it would look on you?" Inline actions "Yes, show me" and "No, just ideas". The assistant proactively offers preview in response to the request. No separate Looktool button or mandatory style quiz. Yes→L2; No stayschatL1 withtextsuggestions.
Screen2 label "L2 · PHOTO WITH PERMISSION": SAME chat, previous messages visible. User bubble "Yes, show me." Assistant "Take a photo or choose one you'd like me to use." Inline attachment card with "Take photo" and "Choose photo". Under card a small chosen photo thumbnail of adult woman creamtop, caption "Selected photo"; explicit primary "Use this photo" toL3, "Cancel" stayschatwithoutgeneration. Small note "Already shared a photo? Ask 'May I use that photo?'" No automaticcapture; camera and photo library accessed only on explicitselection. Native picker returns to this chat, not a full editor.
Screen3 label "L3 · GENERATE INLINE": SAME chat with chosen photo thumbnail preserved and a soft inline loadingcard "Creating your moon-witch preview…" with Cancel. No editedphoto yet. All contextualmessages/composerremain except generatecontrolsdisabledwhileloading. No arbitrary progresspercent. Cancel→L2 withphoto retained; completion→L4. Small errorstatecalloutoutsidephone "Failed → Retry here or keep chatting."
Screen4 label "L4 · IMAGE ANSWER IN CHAT": SAME Glint chat, assistant "Here’s your moon-witch preview." Large generated edited image of same woman in navycape witchhat silverymakeup occupying mainmessagearea; badge "AI preview". Under image four small clearly readable chips arranged2x2 "Change makeup" / "Change outfit" / "Try another look" / "Save". Textcomposer "What would you change?" below. The edited IMAGE is the main answer, not a link out to an editor. Caption "Tap image to enlarge". Changechips requestadjustment in conversation and regenerateinlineL3; Save staysL4 withconfirmation. Tapimage opens optionalfullscreenpreview, Close returnsL4 samechat. No forceeditor.
Large clearly labeled arrows: "Yes → choose photo" L1toL2; "Use this photo → generate" L2toL3; "Complete → image in chat" L3toL4. BranchbelowL1 "No → continue with ideas in the same chat". ReturnbelowL3 "Cancel → L2". BelowL4 "Tap image → fullscreen preview → Close → L4".
Bottom routekey "Ask → suggest → offer preview → permission/photo → generate → image in conversation → refine or save".
Footer "Muse Spark: conversation · Muse Image: planned image editing. Suggestions follow user preferences; no attractiveness ranking or personality inference."
No unrelated menuentries, no speech enrollment, no demo, no separate mandatory editing page.
