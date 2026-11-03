import {expect,it} from "vitest";
import {submissionEnvironment} from "../backend/submission-policy.ts";

it("explicit submission profile disables cloud speech, mocks and comparison agents despite inherited settings",()=>{
  const original={GLINT_NEURAL_VOICE:"1",GLINT_TTS_MOCK:"1",GLINT_LIVEKIT_ENABLED:"1",GLINT_LIVEKIT_AGENT_ENABLED:"1",PORT:"3100"};
  expect(submissionEnvironment(original)).toMatchObject({VITE_GLINT_SUBMISSION_BUILD:"1",GLINT_NEURAL_VOICE:"0",GLINT_TTS_MOCK:"0",GLINT_LIVEKIT_ENABLED:"0",GLINT_LIVEKIT_AGENT_ENABLED:"0",PORT:"3100"});
  expect(original.GLINT_NEURAL_VOICE).toBe("1");
});
