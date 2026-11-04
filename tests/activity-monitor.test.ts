import {afterEach,expect,it,vi} from "vitest";
import {ActivityMonitor,asksForActivityResult,trackingConfirmation,type ActivityState} from "../frontend/activity-monitor";
import type {VisualObservation} from "../shared/agent";
const observation:VisualObservation={activity:"Standing with hands together",scene:"Person visible",changes:[],confidence:"medium",say:null,capturedAt:1000,from:0,epoch:1};
const monitors:ActivityMonitor[]=[];
afterEach(()=>{monitors.splice(0).forEach(m=>m.dispose());vi.useRealTimers();});
function fixture(){
  vi.useFakeTimers();let state:ActivityState|null=null,session:object|null={},visible=true,busy=false;
  const observe=vi.fn(async()=>observation);
  const monitor=new ActivityMonitor({session:()=>session,visible:()=>visible,busy:()=>busy,capture:async()=>[{image:"frame",capturedAt:Date.now()}],observe,change:value=>{state=value;}});
  monitors.push(monitor);
  return {monitor,observe,state:()=>state,setSession:(s:object|null)=>{session=s;},hide:()=>{visible=false;},setBusy:(b:boolean)=>{busy=b;}};
}
it("requires confirmation and keeps sampling beyond a short clip until stopped",async()=>{
  const f=fixture();f.monitor.propose("Observe this exercise");await vi.advanceTimersByTimeAsync(10000);expect(f.observe).not.toHaveBeenCalled();
  f.monitor.confirm();await vi.advanceTimersByTimeAsync(0);expect(f.observe).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(9000);expect(f.observe).toHaveBeenCalledTimes(4);expect(f.state()?.phase).toBe("watching");
  const summary=f.monitor.stop();expect(summary).toContain("4 sampled observations");expect(summary).toContain("no pose or round count was inferred");
  await vi.advanceTimersByTimeAsync(30000);expect(f.observe).toHaveBeenCalledTimes(4);
});
it("discards late observations after stop",async()=>{
  const f=fixture();let finish!:(o:VisualObservation)=>void;
  f.observe.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));f.monitor.propose("Track yoga");f.monitor.confirm();await vi.advanceTimersByTimeAsync(0);
  f.monitor.stop();finish(observation);await vi.advanceTimersByTimeAsync(10000);expect(f.state()?.observations).toEqual([]);expect(f.state()?.phase).toBe("result");
});
it("pauses on provider failure and does not retry paid work until Resume",async()=>{
  const f=fixture();f.observe.mockRejectedValueOnce(Error("Account unavailable"));f.monitor.propose("Track yoga");f.monitor.confirm();await vi.advanceTimersByTimeAsync(0);
  expect(f.state()?.phase).toBe("paused");await vi.advanceTimersByTimeAsync(30000);expect(f.observe).toHaveBeenCalledTimes(1);
  f.monitor.resume();await vi.advanceTimersByTimeAsync(0);expect(f.observe).toHaveBeenCalledTimes(2);
});
it("yields while busy, pauses on hidden page and ends on camera change",async()=>{
  const f=fixture();f.setBusy(true);f.monitor.propose("Track yoga");f.monitor.confirm();await vi.advanceTimersByTimeAsync(4000);expect(f.observe).not.toHaveBeenCalled();
  f.setBusy(false);f.hide();await vi.advanceTimersByTimeAsync(1000);expect(f.state()?.phase).toBe("paused");
  f.setSession(null);f.monitor.cameraChanged();expect(f.state()?.phase).toBe("result");
});
it("recognizes explicit result/stop requests without treating pose questions as stopping",()=>{
  for(const text of ["okay","Okay, done","stop tracking","show me the results","Give me a summary","chalu","How many hand raises?","How many times did I raise my hand?"])expect(asksForActivityResult(text),text).toBe(true);
  expect(asksForActivityResult("Is this pose okay?")).toBe(false);
});
it("counts local raises while voice is busy without capturing or making inference calls",async()=>{
  const f=fixture();f.setBusy(true);f.monitor.propose("Count hand raises",[],"hand_raises");
  expect(f.monitor.propose("Repeat proposal",[],"observe")).toBe(false);expect(f.monitor.context()).toContain("ONE user confirmation");
  const points=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  points[11].y=.4;points[12].y=.4;points[16].y=.7;
  // Pose frames before confirmation cannot start the counter.
  f.monitor.pose(points,0);expect(f.state()?.local).toBeUndefined();f.monitor.confirm();
  let at=0;
  const hold=(raised:boolean)=>{points[15].y=raised?.2:.7;for(let i=0;i<4;i++){f.monitor.pose(points,at);at+=100;}};
  hold(false);for(let n=0;n<5;n++){hold(true);hold(false);}
  expect(f.state()?.local?.count).toBe(5);expect(f.observe).not.toHaveBeenCalled();
  expect(f.monitor.propose("Count again",[],"hand_raises")).toBe(false);expect(f.state()?.local?.count).toBe(5);
  expect(f.monitor.context()).toContain("Observed complete hand raises: 5");
  expect(f.monitor.stop()).toContain("5 complete hand raises");
  hold(true);hold(false);expect(f.state()?.local?.count).toBe(5);
});

it("accepts only explicit short consent while confirmation is pending",()=>{
  for(const text of ["yes","Yes please!","start tracking","go ahead","sare"])expect(trackingConfirmation(text)).toBe("start");
  for(const text of ["no","not now","cancel","vaddu"])expect(trackingConfirmation(text)).toBe("cancel");
  for(const text of ["Is this okay?","Do not start","yes but change the activity","What will you track?"])expect(trackingConfirmation(text)).toBeNull();
});
