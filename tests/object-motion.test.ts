import { expect,it } from "vitest";
import { summarizeMotion,type TrackBox } from "../shared/object-motion.ts";
const box=(x:number,frame:number,extra:Partial<TrackBox>={}):TrackBox=>({objectId:"0",frame,x1:x,y1:100,x2:x+30,y2:130,width:320,height:240,confidence:0.95,...extra});
it("measures left and right using ordered source frames, not arrival order",()=>{
  expect(summarizeMotion([box(120,2),box(40,0),box(80,1)]).direction).toBe("right");
  expect(summarizeMotion([box(120,0),box(80,1),box(40,2)]).direction).toBe("left");
});
it("distinguishes substantial back-and-forth from box jitter",()=>{
  expect(summarizeMotion([box(40,0),box(120,1),box(40,2)]).direction).toBe("back-and-forth");
  expect(summarizeMotion([box(40,0),box(41,1),box(40,2)]).direction).toBe("little-movement");
});
it("does not invent direction for absent, ambiguous, missing or unreliable tracks",()=>{
  for(const boxes of [[],[box(40,0)],[box(40,0),box(80,1),box(120,3)],
    [box(40,0),box(80,1,{objectId:"2"}),box(120,2)],
    [box(40,0),box(80,1,{confidence:0.1}),box(120,2)],
    [box(40,0),box(80,1),box(120,1)]])expect(summarizeMotion(boxes).direction).toBe("uncertain");
});
