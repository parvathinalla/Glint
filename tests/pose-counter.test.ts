import {expect,it} from "vitest";
import {HandRaiseCounter} from "../shared/pose-counter";
import type {Landmark} from "../shared/visual-events";
function pose(raised=false):Landmark[]{
  const points=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
  points[11]={x:.4,y:.4,visibility:1};points[12]={x:.6,y:.4,visibility:1};
  points[15]={x:.4,y:raised?.2:.7,visibility:1};points[16]={x:.6,y:.7,visibility:1};return points;
}
it.each([3,5])("counts %i complete raises without the gesture greeting cooldown",total=>{
  const counter=new HandRaiseCounter();let at=0,result=counter.snapshot("");
  const hold=(raised:boolean)=>{for(let i=0;i<4;i++){result=counter.update(pose(raised),at);at+=100;}};
  hold(false);for(let n=0;n<total;n++){hold(true);hold(false);}
  expect(result.count).toBe(total);
});
it("does not count an initially raised hand, a hold, or threshold jitter",()=>{
  const counter=new HandRaiseCounter();let result=counter.snapshot("");
  for(let at=0;at<2000;at+=100)result=counter.update(pose(true),at);
  expect(result.count).toBe(0);
  for(let at=2000;at<2500;at+=100)result=counter.update(pose(false),at);
  for(let at=2500;at<3500;at+=100){const points=pose();points[15].y=at%200?.31:.34;result=counter.update(points,at);}
  expect(result.count).toBe(0);
});
it("does not bridge missing body evidence or long frame gaps into a repetition",()=>{
  for(const missing of [true,false]){
    const counter=new HandRaiseCounter();
    for(let at=0;at<=300;at+=100)counter.update(pose(false),at);
    for(let at=400;at<=700;at+=100)counter.update(pose(true),at);
    if(missing)counter.update([],800);
    let result=counter.snapshot("");
    for(let at=1500;at<=1800;at+=100)result=counter.update(pose(false),at);
    expect(result.count).toBe(0);expect(result.gaps).toBeGreaterThan(0);
  }
});
it("requires both hands to be visible and rejects replayed frames",()=>{
  const counter=new HandRaiseCounter(),points=pose();points[16].visibility=.1;
  expect(counter.update(points,0).visibleFrames).toBe(0);
  counter.update(pose(false),100);expect(counter.update(pose(true),100).frames).toBe(2);
});
