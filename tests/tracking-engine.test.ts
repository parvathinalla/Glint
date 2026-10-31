import { afterEach,expect,it } from "vitest";
import { randomUUID } from "node:crypto";
import { Engine } from "../server/engine.ts";
import { Store } from "../server/store.ts";
import { SamProvider } from "../server/sam-provider.ts";
import { AgentProvider } from "../server/agent-provider.ts";
import { summarizeMotion,type TrackInput } from "../shared/object-motion.ts";
const now=1700000000000,engines:Engine[]=[];
afterEach(()=>engines.splice(0).forEach(engine=>engine.close()));
const clip=Buffer.alloc(32);clip.write("ftyp",4);
const input=(epoch:number):TrackInput=>({concept:"computer mouse",clip:`data:video/mp4;base64,${clip.toString("base64")}`,from:now-2000,to:now,epoch,requestId:randomUUID()});
function setup(sam:SamProvider,agent=new AgentProvider()){
  const engine=new Engine(new Store(":memory:"),{models:async()=>["muse-spark-test"],infer:async()=>{throw Error("Unexpected provider call");}},()=>now,agent,{},sam);
  engines.push(engine);const {session}=engine.session();return {engine,session};
}
it("uses a key, charges one dispatch and passes fresh motion to Spark without clip bytes",async()=>{
  let calls=0,context="";
  class FakeSam extends SamProvider { override async track(){calls++;return summarizeMotion([0,1,2].map(frame=>({objectId:"0",frame,x1:40+frame*30,y1:40,x2:60+frame*30,y2:60,width:320,height:240})));} }
  const agent=new AgentProvider((async(_url,init)=>{context=String(init?.body);return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"It moved right in the recorded clip."}]}]});}) as typeof fetch);
  const {engine,session}=setup(new FakeSam(),agent);
  await expect(engine.trackMotion(session,input(session.epoch))).rejects.toMatchObject({code:"KEY_REQUIRED"});
  expect(calls).toBe(0);
  await engine.connect(session,"TEST_ONLY_KEY");
  const request=input(session.epoch);
  const result=await engine.trackMotion(session,request);
  expect(result.direction).toBe("right");expect(session.calls).toBe(1);
  await expect(engine.trackMotion(session,request)).rejects.toMatchObject({code:"DUPLICATE"});
  await engine.converse(session,{question:"Which side?",model:"muse-spark-test",epoch:session.epoch,requestId:randomUUID()});
  expect(context).toContain("recordedObjectMotion");expect(context).not.toContain(request.clip);
  engine.clearVision(session);expect(session.motion).toBeUndefined();
});
it("cancels stale tracking and rejects quota or invalid clips before dispatch",async()=>{
  let release!:()=>void,calls=0;
  class DelayedSam extends SamProvider { override async track(){calls++;await new Promise<void>(resolve=>{release=resolve;});return summarizeMotion([]);} }
  const {engine,session}=setup(new DelayedSam());
  await engine.connect(session,"TEST_ONLY_KEY");
  session.calls=100;
  await expect(engine.trackMotion(session,input(session.epoch))).rejects.toMatchObject({code:"APP_LIMIT"});
  expect(calls).toBe(0);session.calls=0;
  await expect(engine.trackMotion(session,{...input(session.epoch),clip:"https://invalid.example/clip"})).rejects.toMatchObject({code:"TRACK_CLIP"});
  expect(calls).toBe(0);
  const pending=engine.trackMotion(session,input(session.epoch));
  engine.phase(session,"paused");release();
  await expect(pending).rejects.toMatchObject({code:"CANCELED"});expect(session.motion).toBeUndefined();
});
