import {afterEach,expect,it,vi} from "vitest";
import {CameraTaskRunner,type TaskDependencies,type CameraTaskEvent} from "../src/camera-task-runner";
import {parseCameraAction} from "../shared/camera-tools";
const photo="data:image/jpeg;base64,/9j/2Q==",generated="data:image/png;base64,YQ==";
afterEach(()=>vi.useRealTimers());
function setup(){
 let session:unknown|null={},visible=true,busy=false;const events:CameraTaskEvent[]=[];
 const deps:TaskDependencies={session:()=>session,visible:()=>visible,busy:()=>busy,now:Date.now,
  capture:vi.fn(async()=>({image:photo,capturedAt:Date.now()})),edit:vi.fn(async()=>generated),track:vi.fn(async()=>"Moved right in the recorded clip."),check:vi.fn(async()=>({verdict:"not_met" as const,summary:"The visible lamp is still on."})),begin:vi.fn(),end:vi.fn(),event:event=>events.push(event)};
 return {deps,events,runner:new CameraTaskRunner(deps),session:(v:unknown|null)=>{session=v;},visible:(v:boolean)=>{visible=v;},busy:(v:boolean)=>{busy=v;}};
}
const action=(name:string,args:unknown,id="call-1")=>parseCameraAction(name,args,id);
it("captures and generates once, then refines the last image even with the camera off",async()=>{
 const t=setup();const first=action("edit_camera_image",{prompt:"Fairy makeup",source:"camera"});
 await t.runner.run(first);await t.runner.run(first);
 expect(t.deps.capture).toHaveBeenCalledTimes(1);expect(t.deps.edit).toHaveBeenCalledTimes(1);
 expect(t.events.at(-1)).toMatchObject({state:"result",kind:"generated",image:generated});
 t.session(null);await t.runner.run(action("edit_camera_image",{prompt:"Purple wings",source:"last_result"},"second"));
 expect(t.deps.edit).toHaveBeenLastCalledWith(generated,"Purple wings",expect.any(AbortSignal));
 expect(t.deps.capture).toHaveBeenCalledTimes(1);t.runner.dispose();
});
it("does not capture or call paid tools until a missing camera is opened",async()=>{
 const t=setup();t.session(null);await t.runner.run(action("edit_camera_image",{prompt:"Fairy makeup",source:"camera"}));
 expect(t.events.at(-1)?.state).toBe("needs-camera");expect(t.deps.capture).not.toHaveBeenCalled();
 t.session({});await t.runner.resume();await t.runner.resume();expect(t.deps.edit).toHaveBeenCalledTimes(1);t.runner.dispose();
});
it("discards a canceled late image and does not emit a result after disposal",async()=>{
 const t=setup();let release!:(image:string)=>void;
 t.deps.edit=vi.fn(()=>new Promise<string>(resolve=>{release=resolve;}));
 const pending=t.runner.run(action("edit_camera_image",{prompt:"Fairy makeup",source:"camera"}));await Promise.resolve();
 t.runner.cancelForeground();release(generated);await pending;
 expect(t.events.some(event=>event.state==="result")).toBe(false);t.runner.dispose();
 await t.runner.run(action("edit_camera_image",{prompt:"Other",source:"camera"},"other"));expect(t.deps.edit).toHaveBeenCalledTimes(1);
});
it("a newer task owns the result even when the canceled provider ignores its signal",async()=>{
 const t=setup();let release!:(image:string)=>void;
 t.deps.edit=vi.fn<TaskDependencies["edit"]>().mockImplementationOnce(()=>new Promise<string>(resolve=>{release=resolve;})).mockResolvedValue(generated);
 const old=t.runner.run(action("edit_camera_image",{prompt:"Old costume",source:"camera"},"old"));await Promise.resolve();
 await t.runner.run(action("edit_camera_image",{prompt:"New costume",source:"camera"},"new"));release(generated);await old;
 expect(t.events.filter(event=>event.state==="result").map(event=>event.id)).toEqual(["new"]);t.runner.dispose();
});
it("rejects unsupported tools, unsafe marks, low-confidence marks and out-of-range schedules",()=>{
 for(const [name,args] of [["shell",{}],["annotate_camera_frame",{frameIndex:0,summary:"Knee",confidence:"high",marks:[{x:.9,y:0,width:.3,height:.2,label:"x"}]}],["annotate_camera_frame",{frameIndex:0,summary:"Unsure",confidence:"low",marks:[{x:0,y:0,width:.2,height:.2,label:"x"}]}],["schedule_camera_check",{condition:"Light off",seconds:600,alertIf:"not_met"}]])
  expect(()=>action(name as string,args)).toThrow();
});
it("marks only the supplied fresh evidence and never calls image generation",async()=>{
 const t=setup();await t.runner.run(action("annotate_camera_frame",{frameIndex:0,summary:"This is the visible port.",confidence:"medium",marks:[{x:.2,y:.3,width:.1,height:.1,label:"Port"}]}),[{image:photo,capturedAt:Date.now()}]);
 expect(t.events.at(-1)).toMatchObject({state:"result",kind:"annotated",image:photo});expect(t.deps.edit).not.toHaveBeenCalled();
 await t.runner.run(action("annotate_camera_frame",{frameIndex:1,summary:"Port",confidence:"low",marks:[]},"missing"),[{image:photo,capturedAt:Date.now()}]);
 expect(t.events.at(-1)?.state).toBe("error");
 await t.runner.run(action("annotate_camera_frame",{frameIndex:0,summary:"Port",confidence:"low",marks:[]},"stale"),[{image:photo,capturedAt:Date.now()-16000}]);expect(t.events.at(-1)?.state).toBe("error");t.runner.dispose();
});
it("camera replacement invalidates an in-flight generation",async()=>{
 const t=setup();let release!:(image:string)=>void;t.deps.edit=vi.fn(()=>new Promise<string>(resolve=>{release=resolve;}));
 const pending=t.runner.run(action("edit_camera_image",{prompt:"Fairy makeup",source:"camera"}));await Promise.resolve();t.session({});t.runner.cameraChanged();release(generated);await pending;
 expect(t.events.some(event=>event.state==="result")).toBe(false);t.runner.dispose();
});
it("checks once at the deadline and alerts for the requested unmet condition",async()=>{
 vi.useFakeTimers();const t=setup();await t.runner.run(action("schedule_camera_check",{condition:"The lamp is off",seconds:5,alertIf:"not_met"}));
 await vi.advanceTimersByTimeAsync(4999);expect(t.deps.check).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1);
 expect(t.deps.check).toHaveBeenCalledTimes(1);expect(t.events.at(-1)).toMatchObject({state:"result",kind:"check",title:"Camera check alert"});
 await vi.advanceTimersByTimeAsync(20000);expect(t.deps.check).toHaveBeenCalledTimes(1);t.runner.dispose();
});
it.each(["hidden","busy","camera","cancel","dispose"])("does not falsely verify when a scheduled check is %s",async(reason)=>{
 vi.useFakeTimers();const t=setup();await t.runner.run(action("schedule_camera_check",{condition:"Lamp off",seconds:5,alertIf:"not_met"}));
 if(reason==="hidden")t.visible(false);if(reason==="busy")t.busy(true);if(reason==="camera"){t.session(null);t.runner.cameraChanged();}if(reason==="cancel")t.runner.cancelWatch();if(reason==="dispose")t.runner.dispose();
 await vi.advanceTimersByTimeAsync(16000);expect(t.deps.check).not.toHaveBeenCalled();expect(t.events.some(event=>event.state==="result")).toBe(false);t.runner.dispose();
});
it("uncertain results stay uncertain and provider errors do not imply success",async()=>{
 vi.useFakeTimers();const t=setup();t.deps.check=vi.fn(async()=>({verdict:"uncertain" as const,summary:"The lamp is occluded."}));
 await t.runner.run(action("schedule_camera_check",{condition:"Lamp off",seconds:5,alertIf:"not_met"}));await vi.advanceTimersByTimeAsync(5000);
 expect(t.events.at(-1)?.title).toBe("Could not verify");
 t.deps.edit=vi.fn(async()=>{throw Error("Access denied");});await t.runner.run(action("edit_camera_image",{prompt:"Fairy makeup",source:"camera"},"edit"));
 expect(t.events.at(-1)).toMatchObject({state:"error",detail:"Access denied"});expect(t.runner.imageAvailable).toBe(false);t.runner.dispose();
});
it("a reset clears prior generated references and scheduled work",async()=>{
 vi.useFakeTimers();const t=setup();await t.runner.run(action("edit_camera_image",{prompt:"Fairy makeup",source:"camera"}));
 await t.runner.run(action("schedule_camera_check",{condition:"Lamp off",seconds:5,alertIf:"not_met"},"watch"));t.runner.reset();
 expect(t.runner.imageAvailable).toBe(false);await vi.advanceTimersByTimeAsync(6000);expect(t.deps.check).not.toHaveBeenCalled();t.runner.dispose();
});
