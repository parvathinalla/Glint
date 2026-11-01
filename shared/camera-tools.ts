import { z } from "zod";
const text=z.string().trim().min(1).max(600);
export const markSchema=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1),label:z.string().trim().min(1).max(120)}).strict().refine(m=>m.x+m.width<=1.001&&m.y+m.height<=1.001,"Mark outside image");
const definitions={
 edit_camera_image:z.object({prompt:z.string().trim().min(3).max(1500),source:z.enum(["camera","last_result"])}).strict(),
 annotate_camera_frame:z.object({frameIndex:z.number().int().min(0).max(5),summary:text,confidence:z.enum(["low","medium","high"]),marks:z.array(markSchema).max(6)}).strict().refine(v=>v.confidence!=="low"||v.marks.length===0,"Uncertain observations must not invent marks"),
 track_object_motion:z.object({concept:z.string().trim().min(2).max(100)}).strict(),
 schedule_camera_check:z.object({condition:text,seconds:z.number().int().min(5).max(120),alertIf:z.enum(["met","not_met"])}).strict(),
 cancel_camera_task:z.object({}).strict(),request_camera:z.object({reason:text}).strict(),
};
export type CameraAction = {[K in keyof typeof definitions]:{id:string;name:K;args:z.infer<(typeof definitions)[K]>}}[keyof typeof definitions];
export const cameraCapabilities=z.object({camera:z.boolean(),tracking:z.boolean(),lastImage:z.boolean(),activeCheck:z.string().max(600).optional(),imageInProgress:z.boolean().optional(),lastResult:z.string().max(700).optional()}).strict();
export type CameraCapabilities=z.infer<typeof cameraCapabilities>;
export function parseCameraAction(name:unknown,args:unknown,id:unknown):CameraAction{
 if(typeof name!=="string"||!Object.hasOwn(definitions,name)||typeof id!=="string"||!id||id.length>200)throw Error("Unknown tool");
 if(typeof args==="string"){if(args.length>12000)throw Error("Tool arguments too large");args=JSON.parse(args);}
 return {id,name,args:definitions[name as keyof typeof definitions].parse(args)} as CameraAction;
}
const object=(properties:Record<string,unknown>)=>({type:"object",additionalProperties:false,properties,required:Object.keys(properties)});
const string={type:"string"};
const functions=[
 ["edit_camera_image","For an explicit request to create/edit a visual result. Capture the current camera view or refine the last generated result. Resolve style from conversation. Progress questions, completion reports and acknowledgments do not authorize generation. How-to or demonstration questions need an explanation or clarification unless the user explicitly requests a generated image. Never use generated images as evidence of real actions.",object({prompt:string,source:{type:"string",enum:["camera","last_result"]}})],
 ["annotate_camera_frame","Mark one supplied camera frame when asked to show a visible issue, part, position or form. Normalized coordinates on that exact frame. Never invent hidden details, diagnoses or calibrated body angles. Low confidence requires empty marks. Missing evidence: ask for a clearer view.",object({frameIndex:{type:"integer"},summary:string,confidence:{type:"string",enum:["low","medium","high"]},marks:{type:"array",items:object({x:{type:"number"},y:{type:"number"},width:{type:"number"},height:{type:"number"},label:string})}})],
 ["track_object_motion","Record and analyze a NEW short MP4 clip of one object, only on user request and when tracking is enabled. Never claim to recover past movement by recording now.",object({concept:string})],
 ["schedule_camera_check","Schedule ONE visible condition check 5–120 seconds from now. This checks the state at the deadline, NOT continuous monitoring or whether something happened earlier. Choose alertIf from user intent. Clarify requests for continuous/event monitoring, repetitions or longer durations.",object({condition:string,seconds:{type:"integer"},alertIf:{type:"string",enum:["met","not_met"]}})],
 ["cancel_camera_task","Stop the current camera task or scheduled check when the user asks.",object({})],
 ["request_camera","Ask the user to open the camera for a visual task. Do not claim a view exists while the camera is off.",object({reason:string})],
] as const;
export const cameraToolDefinitions=functions.map(([name,description,parameters])=>({type:"function",name,description,parameters,strict:true}));
export function actionMessage(action:CameraAction){
 switch(action.name){
 case "edit_camera_image":return action.args.source==="last_result"?"I’m updating your image.":"I’m creating your image.";
 case "annotate_camera_frame":return action.args.summary;
 case "track_object_motion":return `I’ll record a new short clip of the ${action.args.concept}. Keep the camera still and move it now.`;
 case "schedule_camera_check":return `I’ll check whether ${action.args.condition} in ${action.args.seconds} seconds. This is one check at that time.`;
 case "cancel_camera_task":return "I’ll stop the camera task.";
 case "request_camera":return action.args.reason;
 }
}
export const conditionInput=z.object({condition:text,photo:z.string().max(810000),capturedAt:z.number(),epoch:z.number().int().nonnegative(),requestId:z.string().uuid(),model:z.string().max(150)});
export const conditionResult=z.object({verdict:z.enum(["met","not_met","uncertain"]),summary:text}).strict();
export type ConditionResult=z.infer<typeof conditionResult>;

/** Progress questions never authorize another paid generation. */
export function isTaskStatusQuestion(text: string): boolean {
 const value=text.trim().toLowerCase();
 if (/\b(?:create|generate|make|edit|change|add|remove|try|another|new)\b/.test(value)) return false;
 return /\b(?:image|picture|photo|preview|generation|task|it|you)\b/.test(value) && /\b(?:ready|done|finish(?:ed)?|complete(?:d)?|status|progress|still|long|happening|working|created|generated)\b/.test(value);
}
export function isTaskCancelRequest(text: string): boolean {
 return /^(?:please\s+)?(?:cancel|stop|abort)(?:\s+(?:(?:the|my|this|that|current)\s+)?(?:image|picture|photo|generation|task|it))?[.!?]*$/i.test(text.trim());
}
