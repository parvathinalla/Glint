import {expect,it} from "vitest";
import {advanceActivity,emptyActivityProgress,type ActivityEvent} from "../shared/activity-progress";
const frames=[{capturedAt:1},{capturedAt:2},{capturedAt:3}];
const events:ActivityEvent[]=[0,1,2].map(i=>({frameIndex:i,index:i,confidence:"high"}));
it("counts observed ordered checkpoints once, including overlapping camera batches",()=>{
  const targets=["Lower","Hold","Rise"];
  const p=advanceActivity(emptyActivityProgress(),targets,frames,events);
  expect(p.observed).toBe(3);expect(p.sequences).toBe(1);
  expect(advanceActivity(p,targets,frames,events)).toEqual(p);
  const held=advanceActivity(p,targets,[{capturedAt:4}],[{frameIndex:0,index:2,confidence:"high"}]);expect(held.observed).toBe(3);
});
it("records a missing checkpoint as unobserved and does not invent a complete sequence",()=>{
  const p=advanceActivity(emptyActivityProgress(),["First","Middle","Last"],frames,[events[0],events[2]]);
  expect(p.observed).toBe(2);expect(p.sequences).toBe(0);expect(p.unobserved).toEqual(["Middle"]);
});
it("does not count uncertainty or invalid references",()=>{
  const p=advanceActivity(emptyActivityProgress(),["Down","Up"],frames,[{frameIndex:0,index:0,confidence:"low"},{frameIndex:1,index:-1,confidence:"high"},{frameIndex:2,index:23,confidence:"high"}]);
  expect(p.observed).toBe(0);expect(p.sequences).toBe(0);
});
it("counts a repeated single checkpoint only after clear visible release, not occlusion",()=>{
  const targets=["Raised hand"];
  let p=advanceActivity(emptyActivityProgress(),targets,frames,[{frameIndex:0,index:0,confidence:"high"},{frameIndex:1,index:-1,confidence:"low"},{frameIndex:2,index:0,confidence:"high"}]);
  expect(p.observed).toBe(1);
  p=advanceActivity(p,targets,[{capturedAt:4},{capturedAt:5}],[{frameIndex:0,index:-1,confidence:"high"},{frameIndex:1,index:0,confidence:"high"}]);
  expect(p.observed).toBe(2);
});
