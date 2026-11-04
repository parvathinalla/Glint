import {z} from "zod";
export const activityEvent=z.object({frameIndex:z.number().int().min(0).max(3),index:z.number().int().min(-1).max(23),confidence:z.enum(["low","medium","high"])}).strict();
export type ActivityEvent=z.infer<typeof activityEvent>;
export type ActivityProgress={observed:number;sequences:number;nextIndex:number;lastIndex:number;lastAt:number;valid:boolean;unobserved:string[]};
export const emptyActivityProgress=():ActivityProgress=>({observed:0,sequences:0,nextIndex:0,lastIndex:-1,lastAt:-1,valid:false,unobserved:[]});
/** Counts only new, confident classified checkpoints; no missed step is inferred completed. */
export function advanceActivity(progress:ActivityProgress,targets:string[],frames:{capturedAt:number}[],events:ActivityEvent[]):ActivityProgress{
  const next={...progress,unobserved:[...progress.unobserved]};
  for(const event of [...events].sort((a,b)=>a.frameIndex-b.frameIndex)){
    const frame=frames[event.frameIndex];if(!frame||frame.capturedAt<=next.lastAt)continue;
    next.lastAt=frame.capturedAt;
    if(event.confidence!=="high")continue;
    if(event.index===-1){next.lastIndex=-1;continue;}
    if(event.index<0||event.index>=targets.length)continue;
    if(event.index===next.lastIndex)continue;
    next.observed++;next.lastIndex=event.index;
    if(event.index===0){next.valid=true;next.nextIndex=1;}
    else if(next.valid&&event.index===next.nextIndex)next.nextIndex++;
    else{
      for(let i=next.nextIndex;i<event.index;i++)if(!next.unobserved.includes(targets[i]))next.unobserved.push(targets[i]);
      next.valid=false;
    }
    if(next.valid&&next.nextIndex===targets.length){next.sequences++;next.nextIndex=0;next.valid=false;}
  }
  return next;
}
