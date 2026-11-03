/** Explicit submission profile. Never changes the regular development profile. */
export function submissionEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {...env,
    VITE_GLINT_SUBMISSION_BUILD:"1",
    GLINT_NEURAL_VOICE:"0",
    GLINT_TTS_MOCK:"0",
    GLINT_LIVEKIT_ENABLED:"0",
    GLINT_LIVEKIT_AGENT_ENABLED:"0",
  };
}
