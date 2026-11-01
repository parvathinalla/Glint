import {livekitConfig} from "./livekit";

export function livekitAgentConfig(env:NodeJS.ProcessEnv=process.env){
  if(env.GLINT_LIVEKIT_AGENT_ENABLED!=="1")throw Error("Set GLINT_LIVEKIT_AGENT_ENABLED=1 only when ready to test provider usage.");
  const connection=livekitConfig(env);if(!connection)throw Error("Configure the LiveKit prototype connection and access code first.");
  const required=["GLINT_LIVEKIT_STT_MODEL","GLINT_LIVEKIT_TTS_MODEL","GLINT_LIVEKIT_TTS_VOICE","GLINT_LIVEKIT_LLM_PROVIDER","GLINT_LIVEKIT_LLM_MODEL"] as const;
  const missing=required.filter(name=>!env[name]);if(missing.length)throw Error(`Missing prototype settings: ${missing.join(", ")}`);
  const provider=env.GLINT_LIVEKIT_LLM_PROVIDER;
  if(provider!=="baseten"&&provider!=="fireworks")throw Error("GLINT_LIVEKIT_LLM_PROVIDER must be baseten or fireworks.");
  const llmKey=provider==="baseten"?env.BASETEN_API_KEY:env.FIREWORKS_API_KEY;
  if(!llmKey)throw Error(`Configure the ${provider} API key in server secrets.`);
  return {...connection,stt:env.GLINT_LIVEKIT_STT_MODEL!,tts:env.GLINT_LIVEKIT_TTS_MODEL!,ttsVoice:env.GLINT_LIVEKIT_TTS_VOICE!,
    llmModel:env.GLINT_LIVEKIT_LLM_MODEL!,llmKey,
    llmURL:provider==="baseten"?"https://inference.baseten.co/v1":"https://api.fireworks.ai/inference/v1"};
}
