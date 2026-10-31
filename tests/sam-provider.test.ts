import { expect,it } from "vitest";
import { SamProvider,validateTrackingClip } from "../server/sam-provider.ts";
import type { TrackInput } from "../shared/object-motion.ts";
const now=1700000000000;
const bytes=Buffer.alloc(32);bytes.write("ftyp",4);
const input:TrackInput={concept:"computer mouse",clip:`data:video/mp4;base64,${bytes.toString("base64")}`,from:now-2000,to:now,epoch:0,requestId:"98cfc34c-98cf-4d3f-b392-faa4a6231b8a"};
// Official parser README sample mask (27 x 60 pixels), reused at translated boxes.
const mask="!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(";
function frame(n:number,x:number){return `<${n}f>0<|box;x1=${x};y1=100;x2=${x+59};y2=126;w=320;h=334;c=0.95|><|mask;x=0;y=0;c=0.95;data=27,60,~${mask}|>\n`;}
function response(lines:string[],complete=true){const events=lines.map(delta=>({type:"response.output_text.delta",item_id:"msg",output_index:0,content_index:0,delta}));
  return new Response([...events,...(complete?[{type:"response.output_text.done",item_id:"msg",output_index:0,content_index:0,text:lines.join("")},{type:"response.completed"}]:[])].map(e=>`data: ${JSON.stringify(e)}\n\n`).join(""),{headers:{"Content-Type":"text/event-stream"}});}
it("uses the documented SAM video contract and parses actual mask grammar",async()=>{
  const sam=new SamProvider((async(url,init)=>{
    expect(url).toBe("https://api.meta.ai/v1/responses");
    const body=JSON.parse(String(init?.body));
    expect(body.model).toBe("sam-3.1");expect(body.metadata.include_confidence).toBe("true");
    expect(body.input[0].content[1]).toEqual({type:"input_video",video_url:input.clip});
    return response([frame(0,40),frame(1,80),frame(2,120)]);
  }) as typeof fetch);
  const result=await sam.track("TEST_ONLY_KEY",input,new AbortController().signal);
  expect(result.direction).toBe("right");expect(result.boxes).toHaveLength(3);
  expect(result.boxes[0].x2).toBe(100); // parser returns half-open bounds.
});
it("treats no match as uncertainty and rejects partial or malformed results",async()=>{
  const run=(r:Response)=>new SamProvider((async()=>r) as typeof fetch).track("TEST_ONLY_KEY",input,new AbortController().signal);
  expect((await run(response([]))).direction).toBe("uncertain");
  await expect(run(response([frame(0,40)],false))).rejects.toMatchObject({code:"SAM_RESPONSE"});
  await expect(run(response(["not valid geometry"]))).rejects.toMatchObject({code:"SAM_RESPONSE"});
});
it("rejects URLs, stale input and invalid MP4 before dispatch",()=>{
  expect(()=>validateTrackingClip(input,now)).not.toThrow();
  for(const bad of [{...input,clip:"https://example.com/video.mp4"},{...input,to:now-20000},
    {...input,clip:"data:video/mp4;base64,AAAA"}])expect(()=>validateTrackingClip(bad,now)).toThrow();
});
it("sanitizes provider errors without exposing credentials or raw text",async()=>{
  const sam=new SamProvider((async()=>new Response("TEST_ONLY_KEY private",{status:403})) as typeof fetch);
  await expect(sam.track("TEST_ONLY_KEY",input,new AbortController().signal)).rejects.toMatchObject({code:"SAM_ACCESS"});
});
