import {advanceActivity,emptyActivityProgress,type ActivityProgress,type ActivityEvent} from "../shared/activity-progress";
import type {VideoFrame,VisualObservation} from "../shared/agent";
import {HandRaiseCounter,type PoseCount} from "../shared/pose-counter";
import type {Landmark} from "../shared/visual-events";

export type ActivityState={mode:"observe"|"hand_raises";local?:PoseCount;goal:string;phase:"confirmation"|"watching"|"paused"|"result";status:string;observations:VisualObservation[];gaps:number;checks:number;checkpoints:string[];progress:ActivityProgress;startedAt?:number};
export type ActivityDependencies={
  session:()=>unknown;visible:()=>boolean;busy:()=>boolean;
  capture:()=>Promise<VideoFrame[]>;
  observe:(goal:string,frames:VideoFrame[],previous:VisualObservation|undefined,signal:AbortSignal,checkpoints?:string[],nextIndex?:number)=>Promise<VisualObservation & {events?:ActivityEvent[]}>;
  change:(state:ActivityState|null)=>void;
};
/** Foreground sampled observation, explicitly confirmed and stopped by the user. */
export class ActivityMonitor{
  private state:ActivityState|null=null;
  private counter:HandRaiseCounter|null=null;
  private lastPose=0;
  private lastPublish=0;
  private session:unknown;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private controller:AbortController|null=null;
  constructor(private deps:ActivityDependencies){}
  get active(){return this.state?.phase==="watching"||this.state?.phase==="paused";}
  get pending(){return this.state?.phase==="confirmation";}
  propose(goal:string,checkpoints:string[]=[],mode:"observe"|"hand_raises"="observe"){if(this.active||this.pending)return false;this.dispose();this.state={goal,mode,phase:"confirmation",status:"Start only after you confirm.",observations:[],gaps:0,checks:0,checkpoints,progress:emptyActivityProgress()};this.publish();return true;}
  context(){
    if(!this.state)return undefined;
    if(this.pending)return "Activity tracking is awaiting ONE user confirmation. Do not propose or ask permission again. The user can say yes/start or use Start tracking; cancel to change the activity.";
    if(this.active)return `Activity tracking is already confirmed and ${this.state.phase}. Mode: ${this.state.mode}. ${this.state.local?`Observed complete hand raises: ${this.state.local.count}. ${this.state.status}.`:"Sampled observations only; no verified repetition total."} Do not call start_activity_tracking or ask permission again. Keep the current session until the user stops it.`.slice(0,700);
    return undefined;
  }
  confirm(checkpoints?:string[]){if(!this.pending)return;if(checkpoints)this.state!.checkpoints=checkpoints;this.session=this.deps.session();if(!this.session){this.state!.status="Open the camera, then choose Start tracking.";this.publish();return;}this.state!.phase="watching";this.state!.startedAt=Date.now();this.publish();if(this.state!.mode==="hand_raises"){this.counter=new HandRaiseCounter();this.lastPose=performance.now();this.state!.local=this.counter.snapshot("Loading movement tracker");this.watchLocal();}else void this.tick();}
  pause(reason:string){if(!this.active||!this.state)return;clearTimeout(this.timer);this.controller?.abort();this.state.phase="paused";this.state.progress.valid=false;this.counter?.resetCycle();this.state.gaps++;this.state.status=reason;this.publish();}
  resume(){if(this.state?.phase!=="paused")return;if(this.deps.session()!==this.session){this.stop("Camera changed; the previous observation session ended.");return;}this.state.phase="watching";this.counter?.resetCycle();this.lastPose=performance.now();this.publish();if(this.state.mode==="hand_raises")this.watchLocal();else void this.tick();}
  stop(reason="Stopped at your request."){
    clearTimeout(this.timer);this.controller?.abort();this.controller=null;
    if(!this.state)return "No activity tracking session is active.";
    this.state={...this.state,phase:"result",status:reason};this.publish();return this.summary();
  }
  summary(){
    if(!this.state)return "No activity tracking session is active.";
    if(this.state.mode==="hand_raises"){const local=this.state.local;return local?.visibleFrames?`Observed ${local.count} complete hand raise${local.count===1?"":"s"}. ${local.gaps+this.state.gaps?"Some movement was not visible; repetitions may have been missed.":""}`:"No usable pose frames were collected, so I cannot give a count.";}
    const {gaps,checks}=this.state;
    if(!checks)return "Tracking stopped. No usable observations were collected, so I cannot give a count.";
    const counts=this.state.checkpoints.length?`Observed pose/checkpoint count: ${this.state.progress.observed}. Complete configured sequences observed: ${this.state.progress.sequences}. `:"No checkpoints were defined, so no pose or round count was inferred. ";
    return `${counts}${checks} sampled observations; ${gaps} coverage gaps. Sampling may miss repetitions, so this is not a verified total.`;
  }
  dispose(){clearTimeout(this.timer);this.controller?.abort();this.controller=null;this.counter=null;this.state=null;}
  dismiss(){this.dispose();this.deps.change(null);}
  cameraChanged(){if(this.active&&this.deps.session()!==this.session)this.stop("Camera stopped or changed. Coverage ended.");}
  pose(points:Landmark[],at:number){
    if(this.state?.phase!=="watching"||!this.counter)return;
    if(this.deps.session()!==this.session){this.cameraChanged();return;}
    if(!this.deps.visible()){this.pause("Tracking paused while page is hidden");return;}
    this.lastPose=performance.now();
    const prior=this.state.local;
    this.state.local=this.counter.update(points,at);this.state.status=this.state.local.status;
    if(this.state.local.count!==prior?.count||this.state.local.status!==prior?.status||at-this.lastPublish>=500){this.lastPublish=at;this.publish();}
  }
  private watchLocal(){
    if(this.state?.phase!=="watching")return;
    if(this.deps.session()!==this.session){this.cameraChanged();return;}
    if(!this.deps.visible()){this.pause("Tracking paused while page is hidden");return;}
    if(performance.now()-this.lastPose>1500){if(this.state.status!=="Waiting for movement tracker")this.state.gaps++;this.counter?.resetCycle();this.state.status="Waiting for movement tracker";this.publish();}
    this.timer=setTimeout(()=>this.watchLocal(),500);
  }
  private publish(){if(this.state)this.deps.change({...this.state,observations:[...this.state.observations]});}
  private async tick(){
    const state=this.state;if(!state||state.phase!=="watching")return;
    if(this.deps.session()!==this.session){this.stop("Camera stopped or changed. Coverage ended.");return;}
    if(!this.deps.visible()){state.phase="paused";state.progress.valid=false;state.gaps++;state.status="Page hidden; tracking paused. Return and choose Resume tracking.";this.publish();return;}
    if(this.deps.busy()){state.status="Waiting while you speak or Glint answers; tracking remains active.";this.publish();this.timer=setTimeout(()=>void this.tick(),1000);return;}
    const controller=new AbortController();this.controller=controller;
    try{
      state.status="Tracking activity. Ask for results or choose Stop tracking to finish.";this.publish();
      const frames=await this.deps.capture();
      if(controller.signal.aborted||this.state!==state)return;
      if(!frames.length)throw Error("No fresh camera view. Keep the camera open and choose Resume tracking.");
      if(this.deps.busy()){state.gaps++;return;}
      const observation=await this.deps.observe(state.goal,frames,state.observations.at(-1),controller.signal,state.checkpoints,state.progress.nextIndex);
      if(controller.signal.aborted||this.state!==state)return;
      if(state.observations.length>=120){state.observations.shift();state.gaps++;}
      state.progress=advanceActivity(state.progress,state.checkpoints,frames,observation.events??[]);
      state.checks++;state.observations.push(observation);state.status=observation.activity+(observation.confidence==="low"?" · uncertain":"");this.publish();
    }catch(error){
      if(this.state!==state)return;
      if(state.phase!=="watching")return;
      state.gaps++;state.progress.valid=false;
      if(!controller.signal.aborted&&!(error instanceof DOMException&&error.name==="AbortError")){state.phase="paused";state.status=error instanceof Error?error.message:"Observation failed. Choose Resume tracking to continue.";this.publish();}
    }finally{
      if(this.controller===controller)this.controller=null;
      if(this.state===state&&state.phase==="watching")this.timer=setTimeout(()=>void this.tick(),3000);
    }
  }
}

export function asksForActivityResult(text:string){return /^(?:ok(?:ay)?(?:[, ]+(?:done|enough|stop))?|done|stop|enough|chalu|aapu|సరే|ఆపు)[.!?]*$/iu.test(text.trim())||/\b(?:stop|end|finish)\s+(?:the\s+)?tracking\b|\b(?:results?|summary)\b|\bhow many (?:hand raises|arm raises|raises|times|rounds|reps|cycles|poses|steps|checkpoints)(?:\s+(?:have|did|so far|done|completed)|[?!.]*$)|\benni.*(?:round|pose|step|raise|time)|ఎన్ని.*రౌండ్/iu.test(text);}

export function trackingConfirmation(text:string):"start"|"cancel"|null {
  const value=text.trim().replace(/[.!?,]+$/u,"").trim();
  if(/^(?:yes(?: please)?|yeah|yep|okay|ok|sure|start(?: tracking)?|go ahead|avunu|sare|start cheyyi|అవును|సరే)$/iu.test(value))return "start";
  if(/^(?:no(?: thanks)?|not now|cancel(?: tracking)?|stop|vaddu|వద్దు)$/iu.test(value))return "cancel";
  return null;
}
