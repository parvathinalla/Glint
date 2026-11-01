import {fileURLToPath} from "node:url";
import dotenv from "dotenv";
import {cli,defineAgent,inference,ServerOptions,voice} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import {livekitAgentConfig} from "./livekit-agent-config";

dotenv.config({path:[".env.local",".env"],quiet:true});
const config=livekitAgentConfig();
export default defineAgent({
  entry:async ctx=>{
    const session=new voice.AgentSession({
      vad:await silero.VAD.load(),
      stt:new inference.STT({model:config.stt}),
      llm:new openai.LLM({model:config.llmModel,baseURL:config.llmURL,apiKey:config.llmKey,store:false,maxCompletionTokens:600}),
      tts:new inference.TTS({model:config.tts,voice:config.ttsVoice}),
      turnHandling:{turnDetection:"vad",interruption:{mode:"vad",enabled:true},preemptiveGeneration:{enabled:false}},
    });
    session.on(voice.AgentSessionEventTypes.MetricsCollected,({metrics})=>{
      const values:Record<string,number|string>={type:metrics.type,at:Date.now()};
      for(const field of ["durationMs","ttftMs","ttfbMs","audioDurationMs","totalTokens"]){
        const value=(metrics as unknown as Record<string,unknown>)[field];if(typeof value==="number"&&Number.isFinite(value))values[field]=value;
      }
      console.info(`[glint-livekit] ${JSON.stringify(values)}`);
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged,event=>console.info(`[glint-livekit] ${JSON.stringify({type:event.type,state:event.newState,at:Date.now()})}`));
    session.on(voice.AgentSessionEventTypes.UserStateChanged,event=>console.info(`[glint-livekit] ${JSON.stringify({type:event.type,state:event.newState,at:Date.now()})}`));
    const deadline=setTimeout(()=>ctx.shutdown("Prototype five-minute session limit"),5*60000);
    ctx.addShutdownCallback(async()=>{clearTimeout(deadline);await session.close();});
    await session.start({room:ctx.room,agent:new voice.Agent({instructions:
      "You are Glint in an isolated voice-only comparison prototype. Be concise and friendly. Answer in the user's language when possible. Ask a brief clarification for unclear speech. You have no camera, image-generation, browsing or other tools in this prototype. Never claim to see the user or to have executed a task. Do not invent words from garbled speech. Give one short step at a time."}),record:false});
    await ctx.connect();
    session.generateReply({instructions:"Briefly say you are ready for a voice test. Do not claim access to the camera."});
  },
});
cli.runApp(new ServerOptions({agent:fileURLToPath(import.meta.url),agentName:config.agentName,wsURL:config.url,apiKey:config.apiKey,apiSecret:config.apiSecret,numIdleProcesses:0,logLevel:"warn"}));
