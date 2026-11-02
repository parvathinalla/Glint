import {inference,initializeLogger} from "@livekit/agents";
import type {GlintVoice} from "./tts.ts";

/** Cloud synthesis only; the existing reply stream remains the sole playback path. */
export function createLiveKitVoice(env:NodeJS.ProcessEnv=process.env):GlintVoice{
  const model=env.GLINT_LIVEKIT_TTS_MODEL,voice=env.GLINT_LIVEKIT_TTS_VOICE;
  if(!model||!voice||!env.LIVEKIT_API_KEY||!env.LIVEKIT_API_SECRET)throw Error("LiveKit TTS configuration is incomplete.");
  initializeLogger({pretty:false,level:"silent"});
  const sampleRate=24000;
  const tts=new inference.TTS({model,voice,sampleRate,apiKey:env.LIVEKIT_API_KEY,apiSecret:env.LIVEKIT_API_SECRET});
  return {
    name:`livekit-${model}`,sampleRate,streaming:true,
    async synth(text,signal,onAudio){
      signal?.throwIfAborted();
      const stream=tts.stream();
      const abort=()=>stream.close();
      signal?.addEventListener("abort",abort,{once:true});
      const chunks:Float32Array[]=[];let length=0;
      let pending:Float32Array[]=[];let pendingLength=0;
      const flush=()=>{if(!onAudio||!pendingLength)return;const audio=new Float32Array(pendingLength);let offset=0;for(const part of pending){audio.set(part,offset);offset+=part.length;}pending=[];pendingLength=0;onAudio(audio,sampleRate);};
      try{
        signal?.throwIfAborted();stream.pushText(text);stream.endInput();
        for await(const packet of stream){
          signal?.throwIfAborted();
          if(typeof packet==="symbol")continue;
          const frame=packet.frame;
          if(frame.sampleRate!==sampleRate||frame.channels!==1)throw Error("Unexpected LiveKit audio format.");
          const samples=Float32Array.from(frame.data,value=>value/32768);
          length+=samples.length;if(length>sampleRate*60)throw Error("Voice sentence exceeded audio limit.");
          if(onAudio){pending.push(samples);pendingLength+=samples.length;if(pendingLength>=sampleRate*0.12)flush();}else chunks.push(samples);
        }
        signal?.throwIfAborted();if(!length)throw Error("LiveKit returned no audio.");
        flush();
        const samples=new Float32Array(onAudio?0:length);let offset=0;
        for(const chunk of chunks){samples.set(chunk,offset);offset+=chunk.length;}
        return {samples,sampleRate};
      }finally{signal?.removeEventListener("abort",abort);stream.close();}
    },
  };
}
