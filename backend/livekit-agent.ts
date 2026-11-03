import dotenv from "dotenv";
import {defineAgent,inference,voice} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import {livekitAgentConfig} from "./livekit-agent-config";
import {livekitMetric} from "./livekit-telemetry";
import {audibleReply,livekitVoicePolicy} from "./livekit-voice-policy";

dotenv.config({path:[".env.local",".env"],quiet:true});
const config=livekitAgentConfig();
const policy=livekitVoicePolicy(config.llmProvider,config.llmModel);
class GlintVoiceAgent extends voice.Agent{
  override async llmNode(...args:Parameters<voice.Agent["llmNode"]>){
    const stream=await voice.Agent.default.llmNode(this,...args);
    return stream?audibleReply(stream,()=>console.info(`[glint-livekit] ${JSON.stringify({type:"empty_reply",at:Date.now()})}`)):null;
  }
}
export default defineAgent({
  entry:async ctx=>{
    const session=new voice.AgentSession({
      vad:await silero.VAD.load(),
      stt:new inference.STT({model:config.stt}),
      llm:new openai.LLM({model:config.llmModel,baseURL:config.llmURL,apiKey:config.llmKey,store:false,maxCompletionTokens:policy.maxCompletionTokens,...("reasoningEffort" in policy?{reasoningEffort:policy.reasoningEffort}:{})}),
      tts:new inference.TTS({model:config.tts,voice:config.ttsVoice}),
      turnHandling:{turnDetection:"vad",endpointing:{minDelay:policy.endSilenceMs,maxDelay:3000},interruption:{mode:"vad",enabled:true},preemptiveGeneration:{enabled:false}},
    });
    session.on(voice.AgentSessionEventTypes.MetricsCollected,({metrics})=>{
      console.info(`[glint-livekit] ${JSON.stringify(livekitMetric(metrics as unknown as Record<string,unknown>))}`);
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged,event=>console.info(`[glint-livekit] ${JSON.stringify({type:event.type,state:event.newState,at:Date.now()})}`));
    session.on(voice.AgentSessionEventTypes.UserStateChanged,event=>console.info(`[glint-livekit] ${JSON.stringify({type:event.type,state:event.newState,at:Date.now()})}`));
    const deadline=setTimeout(()=>ctx.shutdown("Prototype five-minute session limit"),5*60000);
    ctx.addShutdownCallback(async()=>{clearTimeout(deadline);await session.close();});
    await session.start({room:ctx.room,agent:new GlintVoiceAgent({instructions:
      "You are Glint in an isolated voice-only comparison prototype. Be concise and friendly. Answer in the user's language when possible. Ask a brief clarification for unclear speech. You have no camera, image-generation, browsing or other tools in this prototype. Never claim to see the user or to have executed a task. Do not invent words from garbled speech. Give one short step at a time."}),record:false});
    await ctx.connect();
    await ctx.room.localParticipant?.setAttributes({"glint.llm.provider":config.llmProvider,"glint.llm.model":config.llmModel,"glint.stt.model":config.stt,"glint.tts.model":config.tts});
    session.generateReply({instructions:"Say only: Hi, I’m Glint. I’m ready for your voice test."});
  },
});
