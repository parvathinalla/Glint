import {ReadableStream} from "node:stream/web";
import type {ChatChunk} from "@livekit/agents";

export function livekitVoicePolicy(provider:string,model:string){
  const muse=provider==="baseten"&&model.startsWith("meta-models/muse-spark-open");
  return {
    // This budget includes reasoning. 600 caused reasoning-only/empty replies.
    maxCompletionTokens:2048,
    ...(muse?{reasoningEffort:"low" as const}:{}),
    endSilenceMs:1200,
  };
}

/** A completed reasoning-only reply must not silently leave the user waiting.
 * Cancellation and provider errors propagate without an automatic paid retry. */
export function audibleReply(stream:ReadableStream<ChatChunk|string>,onEmpty:()=>void){
  const reader=stream.getReader();let visible=false,canceled=false;
  return new ReadableStream<ChatChunk|string>({
    async pull(controller){
      try{
        const item=await reader.read();if(canceled)return;
        if(item.done){
          if(!visible){onEmpty();controller.enqueue("I couldn’t finish that reply. Please ask me again.");}
          controller.close();return;
        }
        const text=typeof item.value==="string"?item.value:item.value.delta?.content;
        if(text?.trim())visible=true;
        controller.enqueue(item.value);
      }catch(error){if(!canceled)controller.error(error);}
    },
    async cancel(reason){canceled=true;await reader.cancel(reason);},
  });
}
