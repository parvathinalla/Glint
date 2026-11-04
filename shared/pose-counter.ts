import type {Landmark} from "./visual-events";

export type PoseCount = {count:number; frames:number; visibleFrames:number; gaps:number; status:string};
/** A visible lowered -> raised -> lowered cycle. No model calls or gesture cooldown. */
export class HandRaiseCounter {
  private count=0;
  private frames=0;
  private visibleFrames=0;
  private gaps=0;
  private lastAt=-Infinity;
  private candidate:"lowered"|"raised"|null=null;
  private since=0;
  private baseline=false;
  private raised=false;
  resetCycle(){this.candidate=null;this.baseline=false;this.raised=false;}
  snapshot(status:string):PoseCount{return {count:this.count,frames:this.frames,visibleFrames:this.visibleFrames,gaps:this.gaps,status};}
  update(points:Landmark[],at:number):PoseCount {
    if(!Number.isFinite(at)||at<=this.lastAt)return this.snapshot("Waiting for fresh movement");
    if(at-this.lastAt>600&&this.frames){this.gaps++;this.resetCycle();}
    this.lastAt=at;this.frames++;
    const visible=(i:number)=>!!points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)&&points[i].x>=0&&points[i].x<=1&&points[i].y>=0&&points[i].y<=1&&(points[i].visibility??0)>=.7;
    // Both wrists must be visible: an occluded arm cannot prove a lowered baseline.
    if(![11,12,15,16].every(visible)){
      if(this.candidate!==null||this.baseline||this.raised)this.gaps++;
      this.resetCycle();return this.snapshot("Move both hands and shoulders into view");
    }
    this.visibleFrames++;
    const left=points[15].y-points[11].y,right=points[16].y-points[12].y;
    const span=Math.hypot(points[12].x-points[11].x,points[12].y-points[11].y);
    const high=Math.max(.015,Math.min(.12,span*.4)),low=Math.max(.01,Math.min(.08,span*.25));
    const position=left<-high||right<-high?"raised":left>low&&right>low?"lowered":null;
    if(!position){this.candidate=null;return this.snapshot("Tracking movement");}
    if(this.candidate!==position){this.candidate=position;this.since=at;}
    if(at-this.since<200)return this.snapshot("Tracking movement");
    if(position==="raised"&&this.baseline)this.raised=true;
    if(position==="lowered"){
      if(this.baseline&&this.raised){this.count++;this.raised=false;}
      this.baseline=true;
    }
    return this.snapshot(this.baseline?"Tracking hand raises":"Lower your hands to begin");
  }
}
