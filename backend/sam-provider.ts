import { parseVideoStream, recordsOfKind } from "@meta-sam/parser";
import { z } from "zod";
import { readEvents } from "../shared/events.ts";
import { summarizeMotion, type TrackInput } from "../shared/object-motion.ts";
import { Problem } from "./provider.ts";

/** Only caller-supplied, bounded MP4 data; never fetch a user-controlled URL. */
export function validateTrackingClip(input: TrackInput, now: number) {
  if (input.to < input.from || input.to-input.from > 3500 || input.to-input.from < 500 ||
      input.to>now+1000 || now-input.to>15000)
    throw new Problem(400, "TRACK_CLIP", "Record a fresh, short clip before tracking.");
  if (!/^data:video\/mp4;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.clip))
    throw new Problem(400, "TRACK_CLIP", "SAM tracking requires an MP4 camera clip.");
  const bytes=Buffer.from(input.clip.split(",")[1],"base64");
  if(bytes.length<24 || bytes.length>600000 || bytes.toString("ascii",4,8)!=="ftyp")
    throw new Problem(400,"TRACK_CLIP","The MP4 clip is invalid or too large.");
}

export class SamProvider {
  constructor(private fetcher: typeof fetch = fetch) {}
  async track(key: string, input: TrackInput, signal: AbortSignal) {
    const response=await this.fetcher("https://api.meta.ai/v1/responses",{
      method:"POST", signal,
      headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json",Accept:"text/event-stream"},
      body:JSON.stringify({model:"sam-3.1",store:false,stream:true,metadata:{include_confidence:"true"},
        input:[{type:"message",role:"user",content:[{type:"input_text",text:input.concept},{type:"input_video",video_url:input.clip}]}]}),
    });
    if(!response.ok)throw new Problem(response.status===401||response.status===403?401:502,
      "SAM_ACCESS","SAM could not track this clip. Check SAM model access and account limits. No retry was sent.");
    if(!response.headers.get("content-type")?.includes("text/event-stream"))
      throw new Problem(502,"SAM_RESPONSE","SAM did not return the expected segmentation stream.");
    const events: Array<{type:string;[key:string]:unknown}>=[];
    let size=0;
    try {
      await readEvents(response,raw=>{
        const event=z.object({type:z.string()}).passthrough().parse(raw);
        size+=JSON.stringify(event).length;
        if(size>4000000 || events.length>=512)throw Error("Segmentation exceeds bounds");
        events.push(event);
      });
      const rawText=events.map(e=>e.type==="response.output_text.delta" && typeof e.delta==="string"?e.delta:
        e.type==="response.output_text.done" && typeof e.text==="string"?e.text:"").join("");
      // Bound mask allocations before handing provider data to the decoder.
      const rasterSizes=[...rawText.matchAll(/<\|mask;[^|]*?;data=(\d+),(\d+),/g)];
      if(rasterSizes.length>128 || rasterSizes.some(m=>Number(m[1])>640 || Number(m[2])>640 || Number(m[1])*Number(m[2])>409600))
        throw Error("Mask exceeds bounds");
      async function* source(){yield* events;}
      const result=await parseVideoStream(source()).finalResult;
      if(result.outcome.status!=="completed" || result.diagnostics.length ||
          recordsOfKind(result.records,"text").some(record=>record.text.trim()))
        throw Error("Incomplete or invalid segmentation");
      const dimensions=[...result.rawOutput.matchAll(/<\|box;[^|]*;w=(\d+);h=(\d+)(?:;c=[\d.]+)?\|>/g)];
      const width=Number(dimensions[0]?.[1]),height=Number(dimensions[0]?.[2]);
      if(dimensions.length>128 || width>640 || height>640)throw Error("Frame exceeds bounds");
      if(dimensions.some(d=>Number(d[1])!==width||Number(d[2])!==height))throw Error("Changed frame dimensions");
      const records=recordsOfKind(result.records,"box");
      if(records.length>128)throw Error("Too many track observations");
      const boxes=records.map(b=>({objectId:b.objectId,frame:b.frame?.frameIndex??-1,
        x1:b.left,y1:b.top,x2:b.right,y2:b.bottom,width,height,confidence:b.confidence}));
      return summarizeMotion(boxes);
    } catch(error) {
      if(signal.aborted)throw error;
      throw new Problem(502,"SAM_RESPONSE","SAM tracking was incomplete or unreadable. No movement was inferred.");
    }
  }
}
