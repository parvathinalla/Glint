import {z} from "zod";
import {voiceDiagnostic} from "./voice-diagnostics";

const operations=["session","session/reset","phase","vision/stop","key","observe","voice","agent/stream","look-preview","track","condition-check","converse","transcribe","image","condition","other"] as const;
export const diagnosticEvent=z.object({
  at:z.number().finite().nonnegative(),
  stage:z.enum(["request-start","request-end","request-error","provider-start","provider-end","provider-error","route","task","voice","queue","observation","session","ui-error","capture-start","capture-end","image-encode-start","image-encode-end","stream-first-text","stream-end","stream-error"]),
  operation:z.enum(operations).optional(),
  requestId:z.string().uuid().optional(),
  durationMs:z.number().finite().min(0).max(86400000).optional(),
  status:z.number().int().min(0).max(599).optional(),
  calls:z.number().int().nonnegative().optional(),
  turn:z.number().int().nonnegative().optional(),
  count:z.number().int().nonnegative().optional(),
  voiceStage:voiceDiagnostic.shape.stage.optional(),
  state:z.enum(["busy","result","error","needs-camera","watching","canceled"]).optional(),
  action:z.enum(["edit_camera_image","annotate_camera_frame","track_object_motion","schedule_camera_check","cancel_camera_task","request_camera","answer"]).optional(),
  reason:z.enum(["status","cancel","ambiguous","acknowledgment","normal","queued","queue-full","early-final","fallback","hidden","disabled","budget","limit","busy","invalid","canceled","network","provider","http","unknown","echo","empty","short","owner","stranger","unverified","lock-off"]).optional(),
}).strict();
export type DiagnosticEvent=z.infer<typeof diagnosticEvent>;
export type TraceInput=Omit<DiagnosticEvent,"at">;
export const diagnosticBatch=z.object({events:z.array(diagnosticEvent).max(40)}).strict();
export function diagnosticOperation(path:string):DiagnosticEvent["operation"]{
  return (operations as readonly string[]).includes(path)?path as DiagnosticEvent["operation"]:"other";
}
/** Content-free, bounded, transient records. Unknown fields and strings are rejected. */
export class DiagnosticBuffer{
  private events:DiagnosticEvent[]=[];
  private pending:DiagnosticEvent[]=[];
  constructor(private clock=Date.now,private limit=500){}
  record(input:TraceInput){return this.accept({...input,at:this.clock()});}
  accept(input:unknown){
    const parsed=diagnosticEvent.safeParse(input);if(!parsed.success)return null;
    this.events.push(parsed.data);this.events=this.events.slice(-this.limit);
    this.pending.push(parsed.data);this.pending=this.pending.slice(-this.limit);
    return parsed.data;
  }
  snapshot(){return this.events.map(event=>({...event}));}
  takeBatch(){return this.pending.splice(0,40);}
}
