import {afterEach,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {Engine} from "../backend/engine";
import {Store} from "../backend/store";
import {ActivityProvider} from "../backend/activity-provider";
const engines:Engine[]=[];afterEach(()=>engines.splice(0).forEach(e=>e.close()));
it("activity observations enforce key, freshness, dedupe and quota before provider calls",async()=>{
  const now=Date.now();let calls=0,body:Record<string,unknown>={};
  const activity=new ActivityProvider((async(_url,init)=>{
    calls++;body=JSON.parse(String(init?.body));return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({activity:"Standing",scene:"Person visible",changes:[],confidence:"medium",say:null,events:[]})}]}]});
  }) as typeof fetch);
  const e=new Engine(new Store(":memory:"),{models:async()=>["muse-spark-test"],infer:async()=>{throw Error("Unexpected inference");}},()=>now,undefined,undefined,undefined,undefined,undefined,activity);engines.push(e);
  const {session}=e.session();const input={goal:"Observe any activity",checkpoints:[],nextIndex:0,frames:[{image:"data:image/jpeg;base64,fixture",capturedAt:now}],model:"muse-spark-test",requestId:randomUUID(),epoch:session.epoch};
  await expect(e.checkActivity(session,input)).rejects.toMatchObject({code:"MODEL_REQUIRED"});
  await e.connect(session,"TEST_ONLY_KEY");input.epoch=session.epoch;
  await expect(e.checkActivity(session,{...input,frames:[{...input.frames[0],capturedAt:now-6000}]})).rejects.toMatchObject({code:"FRAMES_STALE"});
  expect(calls).toBe(0);const result=await e.checkActivity(session,input);expect(result.activity).toBe("Standing");expect(session.calls).toBe(1);
  expect(JSON.stringify(body)).toContain("Do not infer skipped steps");expect(body.store).toBe(false);
  await expect(e.checkActivity(session,input)).rejects.toMatchObject({code:"DUPLICATE"});
  session.calls=3000;await expect(e.checkActivity(session,{...input,requestId:randomUUID()})).rejects.toMatchObject({code:"APP_LIMIT"});expect(calls).toBe(1);
});
it("rejects invented checkpoint indices, missing frames and duplicate frame classifications",async()=>{
  for(const events of [
    [{frameIndex:0,index:5,confidence:"high"}],
    [{frameIndex:3,index:0,confidence:"high"}],
    [{frameIndex:0,index:0,confidence:"high"},{frameIndex:0,index:0,confidence:"high"}],
  ]){
    const activity=new ActivityProvider((async()=>Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({activity:"Standing",scene:"Visible",changes:[],confidence:"medium",say:null,events})}]}]})) as typeof fetch);
    await expect(activity.observe("TEST_ONLY_KEY","muse-spark-test","Track",["Stand"],[{image:"frame",capturedAt:Date.now()}],0,new AbortController().signal)).rejects.toMatchObject({code:"ACTIVITY_RESPONSE"});
  }
});
