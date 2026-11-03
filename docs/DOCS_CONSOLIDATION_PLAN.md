# Task 3: documentation consolidation plan

This is a plan, not an instruction to rewrite or relocate every file now. No original document is deleted in this pass. Preserve relative links and assets when executing archive moves. Do not overwrite the approved design with descriptions of current limitations; record gaps in the audit instead.

| Current file | Keep / merge into / archive | Target file | Reason |
| --- | --- | --- | --- |
| CONVERSATION_UI.md | archive | archive/CONVERSATION_UI.md | Historical or experimental detail, outside the single submission flow |
| CURRENT_ARCHITECTURE.md | merge into, then archive original | HIGH_LEVEL_ARCHITECTURE.md; archive/CURRENT_ARCHITECTURE.md | Preserve useful detail once; distinguish targets from measured behavior |
| DESIGN.md | merge into, then archive original | GLINT_DESIGN_DOCUMENT.md; archive/DESIGN.md | Preserve useful detail once; distinguish targets from measured behavior |
| GLINT_ARCHITECTURE.md | merge into, then archive original | HIGH_LEVEL_ARCHITECTURE.md; archive/GLINT_ARCHITECTURE.md | Preserve useful detail once; distinguish targets from measured behavior |
| GLINT_DESIGN_DOCUMENT.md | keep | GLINT_DESIGN_DOCUMENT.md | Canonical approved requirements |
| GLINT_DESIGN.md | merge into, then archive original | GLINT_DESIGN_DOCUMENT.md; archive/GLINT_DESIGN.md | Preserve useful detail once; distinguish targets from measured behavior |
| GLINT_PLAN.md | merge into, then archive original | GLINT_DESIGN_DOCUMENT.md; archive/GLINT_PLAN.md | Preserve useful detail once; distinguish targets from measured behavior |
| GLINT_REALTIME_ARCHITECTURE_PLAN.md | merge into, then archive original | GLINT_DESIGN_DOCUMENT.md; archive/GLINT_REALTIME_ARCHITECTURE_PLAN.md | Preserve useful detail once; distinguish targets from measured behavior |
| HIGH_LEVEL_ARCHITECTURE.md | merge into, then archive | README.md architecture; archive/HIGH_LEVEL_ARCHITECTURE.md | Keep one judge-facing diagram; source review remains historical evidence |
| IMPLEMENTATION.md | archive | archive/IMPLEMENTATION.md | Historical or experimental detail, outside the single submission flow |
| LIVEKIT_PROTOTYPE.md | archive | archive/LIVEKIT_PROTOTYPE.md | Historical or experimental detail, outside the single submission flow |
| LOOK_PREVIEWS.md | archive | archive/LOOK_PREVIEWS.md | Historical or experimental detail, outside the single submission flow |
| OBJECT_TRACKING.md | keep | OBJECT_TRACKING.md | SAM implementation and its limitations |
| OPENING.md | archive | archive/OPENING.md | Historical or experimental detail, outside the single submission flow |
| PIPELINE_COMPARISON.md | archive | archive/PIPELINE_COMPARISON.md | Historical or experimental detail, outside the single submission flow |
| PRODUCTION_RENDER.md | archive | archive/PRODUCTION_RENDER.md | Historical or experimental detail, outside the single submission flow |
| PROVIDER_REFERENCE.md | archive | archive/PROVIDER_REFERENCE.md | Historical or experimental detail, outside the single submission flow |
| SPIKE.md | keep | SPIKE.md | Provider integration history |
| TEST_REPORT.md | keep | TEST_REPORT.md | Evidence history, with current receipt still required |
| VISUAL_AWARENESS.md | archive | archive/VISUAL_AWARENESS.md | Historical or experimental detail, outside the single submission flow |
| VOICE_FILTERING.md | merge into, then archive original | TEST_REPORT.md; archive/VOICE_FILTERING.md | Preserve useful detail once; distinguish targets from measured behavior |
| VOICE_GOAL_REPORT.md | merge into, then archive original | TEST_REPORT.md; archive/VOICE_GOAL_REPORT.md | Preserve useful detail once; distinguish targets from measured behavior |
| VOICE_LATENCY.md | merge into, then archive original | TEST_REPORT.md; archive/VOICE_LATENCY.md | Preserve useful detail once; distinguish targets from measured behavior |
| VOICE_QUALITY_EVAL.md | merge into, then archive original | TEST_REPORT.md; archive/VOICE_QUALITY_EVAL.md | Preserve useful detail once; distinguish targets from measured behavior |
| README.md previous content | move, preserved snapshot | docs/build-log.md | Keep implementation history out of the first screen |
| docs/research/ and docs/ui-concepts/ | leave untouched; review before commit | future archive/research and archive/ui-concepts | Historical working material, not verified submission evidence |

Target primary set: docs/README.md, GLINT_DESIGN_DOCUMENT.md, TEST_REPORT.md, OBJECT_TRACKING.md, SPIKE.md, SUBMISSION.md and LIVE_VERIFICATION.md. Keep audit/checklist/About artifacts as supporting submission material. Historical originals go under docs/archive/ with an index link. build-log.md remains the explicit preservation log requested for this pass. Do not claim consolidation complete until moves and link checks are actually done.
