import {afterEach,expect,it} from "vitest";
import {ReadableStream} from "node:stream/web";
import {createServer,type Server} from "node:http";
import {once} from "node:events";
import {ChatContext,initializeLogger} from "@livekit/agents";
import {LLM} from "@livekit/agents-plugin-openai";
import {audibleReply,livekitVoicePolicy} from "../server/livekit-voice-policy";

async function collect<T>(stream:ReadableStream<T>){const items:T[]=[];for await(const item of stream)items.push(item);return items;}

it("does not silently finish a reasoning-only generation",async()=>{
  let empty=0;
  const source=ReadableStream.from([{id:"usage-only",usage:{completionTokens:600,promptTokens:300,totalTokens:900,promptCachedTokens:0}}]);
  const result=await collect(audibleReply(source,()=>{empty++;}));
  expect(empty).toBe(1);expect(result.at(-1)).toBe("I couldn’t finish that reply. Please ask me again.");
});
it("preserves visible text and never appends a fallback to a normal reply",async()=>{
  let empty=0;const source=ReadableStream.from([{id:"one",delta:{role:"assistant" as const,content:"Hello."}}]);
  const result=await collect(audibleReply(source,()=>{empty++;}));
  expect(result).toHaveLength(1);expect(empty).toBe(0);
});
it("propagates cancellation and provider errors without a fallback or paid retry",async()=>{
  let canceled=false,empty=0;
  const source=new ReadableStream<string>({cancel(){canceled=true;}});
  await audibleReply(source,()=>{empty++;}).cancel();expect(canceled).toBe(true);expect(empty).toBe(0);
  const broken=new ReadableStream<string>({start(controller){controller.error(Error("provider unavailable"));}});
  await expect(collect(audibleReply(broken,()=>{empty++;}))).rejects.toThrow("provider unavailable");expect(empty).toBe(0);
});
it("leaves unverified providers alone and gives natural pauses more time",()=>{
  expect(livekitVoicePolicy("baseten","meta-models/muse-spark-open-1026")).toMatchObject({reasoningEffort:"low",maxCompletionTokens:2048,endSilenceMs:1200});
  expect(livekitVoicePolicy("fireworks","some-other-model")).not.toHaveProperty("reasoningEffort");
});

let server:Server|undefined;
afterEach(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;});
it("the installed LiveKit adapter sends low reasoning and the larger budget on the wire",async()=>{
  initializeLogger({pretty:false,level:"silent"});
  let body:Record<string,unknown>={};
  server=createServer(async(req,res)=>{
    let input="";for await(const chunk of req)input+=chunk;body=JSON.parse(input);
    res.writeHead(200,{"Content-Type":"text/event-stream"});
    res.end('data: {"id":"test","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });server.listen(0,"127.0.0.1");await once(server,"listening");
  const policy=livekitVoicePolicy("baseten","meta-models/muse-spark-open-1026");
  const model=new LLM({model:"meta-models/muse-spark-open-1026",baseURL:`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`,apiKey:"TEST_ONLY_KEY",store:false,maxCompletionTokens:policy.maxCompletionTokens,reasoningEffort:policy.reasoningEffort});
  const chatCtx=ChatContext.empty();chatCtx.addMessage({role:"user",content:"Hello"});
  const stream=model.chat({chatCtx});const output=[];for await(const chunk of stream)output.push(chunk);
  expect(body).toMatchObject({reasoning_effort:"low",max_completion_tokens:2048,store:false,stream:true});
  expect(output.some(chunk=>chunk.delta?.content==="Hello.")).toBe(true);
});
