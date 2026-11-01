import {parseCameraAction,type CameraAction,type ConditionResult,type markSchema} from "../shared/camera-tools";
import type {z} from "zod";
export type EvidenceFrame={image:string;capturedAt:number};
export type CameraTaskEvent={id:string;state:"busy"|"result"|"error"|"needs-camera"|"watching"|"canceled";title:string;detail:string;image?:string;kind?:"generated"|"annotated"|"tracking"|"check";marks?:z.infer<typeof markSchema>[];deadline?:number};
export type TaskDependencies={
 session:()=>unknown|null;visible:()=>boolean;busy:()=>boolean;now:()=>number;
 capture:(signal:AbortSignal)=>Promise<EvidenceFrame>;
 edit:(image:string,prompt:string,signal:AbortSignal)=>Promise<string>;
 track:(concept:string,signal:AbortSignal)=>Promise<string>;
 check:(condition:string,frame:EvidenceFrame,signal:AbortSignal)=>Promise<ConditionResult>;
 begin:(controller:AbortController)=>void;end:(controller:AbortController)=>void;
 event:(event:CameraTaskEvent)=>void;
};
/** Bounded, cancelable tools. Model output never gets arbitrary code or URL access. */
export class CameraTaskRunner {
 private job:AbortController|null=null;
 private jobSession:unknown=null;
 private jobNeedsCamera=true;
 private watch:{id:string;condition:string;deadline:number;alertIf:"met"|"not_met";session:unknown;timer:ReturnType<typeof setTimeout>;controller?:AbortController}|null=null;
 private seen=new Set<string>();
 private lastImage="";
 private disposed=false;
 private pending:CameraAction|null=null;
 constructor(private deps:TaskDependencies){}
 get imageAvailable(){return !!this.lastImage;}
 get activeCheck(){return this.watch?.condition;}
 get hasPending(){return !!this.pending;}
 dismissPending(){this.pending=null;}
 async resume(){const action=this.pending;this.pending=null;if(action)await this.run(action,[],true);}
 cameraChanged(){if(this.watch&&this.watch.session!==this.deps.session())this.cancelWatch("Camera changed; the scheduled check was canceled.");if(this.jobNeedsCamera&&this.jobSession!==this.deps.session())this.job?.abort();}
 cancelForeground(){const job=this.job;this.job=null;job?.abort();this.pending=null;}
 cancelWatch(detail="Scheduled check canceled."){
   const watch=this.watch;if(!watch)return;this.watch=null;clearTimeout(watch.timer);watch.controller?.abort();
   this.emit({id:watch.id,state:"canceled",title:"Check canceled",detail});
 }
 dispose(){this.disposed=true;this.job?.abort();if(this.watch){clearTimeout(this.watch.timer);this.watch.controller?.abort();}this.watch=null;this.pending=null;this.lastImage="";}
 reset(){this.job?.abort();this.job=null;this.cancelWatch();this.pending=null;this.lastImage="";}
 private emit(event:CameraTaskEvent){if(!this.disposed)this.deps.event(event);}
 async run(raw:CameraAction,frames:EvidenceFrame[]=[],resume=false){
   if(this.disposed)return;
   let action:CameraAction;
   try{action=parseCameraAction(raw.name,raw.args,raw.id);}catch{this.emit({id:"invalid",state:"error",title:"Action not executed",detail:"The requested tool or its arguments were invalid."});return;}
   if(!resume){if(this.seen.has(action.id))return;this.seen.add(action.id);if(this.seen.size>100)this.seen.delete(this.seen.values().next().value!);}
   if(action.name==="cancel_camera_task"){this.cancelForeground();this.cancelWatch();this.emit({id:action.id,state:"canceled",title:"Camera task stopped",detail:"No further work is scheduled."});return;}
   const needsCamera=action.name!=="edit_camera_image"||action.args.source!=="last_result";
   if(action.name==="request_camera"||(needsCamera&&!this.deps.session())){
     if(action.name!=="request_camera"&&action.name!=="annotate_camera_frame")this.pending=action;
     this.emit({id:action.id,state:"needs-camera",title:"Open the camera",detail:action.name==="request_camera"?action.args.reason:"Open the camera before this task can run. No image was captured or generated."});return;
   }
   if(action.name==="schedule_camera_check"){
     this.cancelWatch("Replaced by the new scheduled check.");
     const deadline=this.deps.now()+action.args.seconds*1000;
     const timer=setTimeout(()=>void this.checkDeadline(),action.args.seconds*1000);
     this.watch={id:action.id,...action.args,deadline,session:this.deps.session(),timer};
     this.emit({id:action.id,state:"watching",title:"Camera check scheduled",detail:`One check: ${action.args.condition}`,deadline});return;
   }
   this.job?.abort();const controller=new AbortController();this.job=controller;
   const session=this.deps.session(),current=()=>!this.disposed&&this.job===controller&&!controller.signal.aborted&&(!needsCamera||session===this.deps.session());
   this.jobSession=session;this.jobNeedsCamera=needsCamera;
   this.deps.begin(controller);
   this.emit({id:action.id,state:"busy",kind:action.name==="edit_camera_image"?"generated":action.name==="track_object_motion"?"tracking":"annotated",title:action.name==="edit_camera_image"?"Creating your image…":action.name==="track_object_motion"?"Recording a new movement clip…":"Preparing the marked frame…",detail:"You can cancel this task."});
   try{
     if(action.name==="edit_camera_image"){
       const image=action.args.source==="last_result"?this.lastImage:(await this.deps.capture(controller.signal)).image;
       if(!image)throw Error("There is no previous generated image to edit.");
       if(!current())return;
       const result=await this.deps.edit(image,action.args.prompt,controller.signal);
       if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(result)||result.length>10800000)throw Error("The tool returned an unsupported image.");
       if(!current())return;this.lastImage=result;
       this.emit({id:action.id,state:"result",kind:"generated",title:"Your image is ready",detail:action.args.prompt,image:result});
     }else if(action.name==="annotate_camera_frame"){
       const frame=frames[action.args.frameIndex];
       if(!frame||this.deps.now()-frame.capturedAt>15000||frame.capturedAt>this.deps.now()+1000)throw Error("That evidence frame is no longer current. Ask again with a fresh camera view.");
       if(!current())return;
       this.emit({id:action.id,state:"result",kind:"annotated",title:"Marked camera evidence",detail:action.args.summary,image:frame.image,marks:action.args.marks});
     }else if(action.name==="track_object_motion"){
       const detail=await this.deps.track(action.args.concept,controller.signal);if(!current())return;
       this.emit({id:action.id,state:"result",kind:"tracking",title:"Recorded movement result",detail});
     }
   }catch(error){
     if(!this.disposed&&this.job===controller)this.emit({id:action.id,state:controller.signal.aborted?"canceled":"error",title:controller.signal.aborted?"Task canceled":"Task could not finish",detail:controller.signal.aborted?"No late result will be shown.":error instanceof Error?error.message:"The tool failed. Nothing was retried automatically."});
   }finally{if(this.job===controller)this.job=null;this.deps.end(controller);}
 }
 private async checkDeadline(){
   const watch=this.watch;if(!watch||this.disposed)return;
   if(watch.session!==this.deps.session()){this.cancelWatch("Camera changed; unable to verify the condition.");return;}
   if(!this.deps.visible()||this.deps.now()-watch.deadline>10000){this.cancelWatch("The page was hidden or the check was delayed. The condition was not verified.");return;}
   if(this.deps.busy()) {watch.timer=setTimeout(()=>void this.checkDeadline(),250);return;}
   const controller=new AbortController();watch.controller=controller;
   const current=()=>!this.disposed&&this.watch===watch&&!controller.signal.aborted&&watch.session===this.deps.session();
   this.deps.begin(controller);
   try{
     const frame=await this.deps.capture(controller.signal);if(!current())return;
     const result=await this.deps.check(watch.condition,frame,controller.signal);if(!current())return;
     this.watch=null;
     this.emit({id:watch.id,state:"result",kind:"check",title:result.verdict==="uncertain"?"Could not verify":result.verdict===watch.alertIf?"Camera check alert":"Camera check complete",detail:result.summary+` Frame captured ${Math.max(0,Math.round((frame.capturedAt-watch.deadline)/1000))} seconds after the scheduled time. One check, not continuous monitoring.`,image:frame.image});
   }catch(error){if(current()){this.watch=null;this.emit({id:watch.id,state:"error",title:"Check not verified",detail:error instanceof Error?error.message:"The scheduled check failed."});}}
   finally{if(this.watch===watch&&controller.signal.aborted){this.watch=null;this.emit({id:watch.id,state:"canceled",title:"Check interrupted",detail:"The condition was not verified."});}this.deps.end(controller);}
 }
}
