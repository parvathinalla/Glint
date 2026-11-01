import {afterEach,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {ConditionProvider} from "../server/condition-provider";
import {Engine} from "../server/engine";
import {Store} from "../server/store";
import {AgentProvider} from "../server/agent-provider";
import {SamProvider} from "../server/sam-provider";
import {ImageProvider} from "../server/image-provider";
const engines:Engine[]=[];afterEach(()=>engines.splice(0).forEach(engine=>engine.close()));
const envelope=(verdict:string)=>({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({verdict,summary:"The lamp is occluded."})}]}]});
it("requests one evidence-based structured verdict without tools or persistence",async()=>{
 let sent:Record<string,unknown>={};const provider=new ConditionProvider((async(url,init)=>{expect(url).toBe("https://api.meta.ai/v1/responses");sent=JSON.parse(String(init?.body));return Response.json(envelope("uncertain"));}) as typeof fetch);
 expect((await provider.check("TEST_ONLY_KEY","muse-spark-test","Lamp off","data:image/jpeg;base64,photo",new AbortController().signal)).verdict).toBe("uncertain");
 expect(sent).toMatchObject({store:false,stream:false});expect(sent.tools).toBeUndefined();expect(sent.instructions).toContain("Never infer earlier events");
});
it("does not interpret malformed or incomplete results as a condition being met",async()=>{
 for(const response of [Response.json(envelope("yes")),Response.json({...envelope("met"),status:"incomplete"}),new Response("not json"),new Response("account detail",{status:403})]){
  const provider=new ConditionProvider((async()=>response) as typeof fetch);
  await expect(provider.check("TEST_ONLY_KEY","muse-spark-test","Lamp off","photo",new AbortController().signal)).rejects.toMatchObject({code:expect.stringMatching(/^CHECK_/)});
 }
});
it("checks authentication, allowed models, fresh evidence, quota and duplicate IDs before paid dispatch",async()=>{
 const now=1700000000000;let calls=0;
 const provider=new ConditionProvider((async()=>{calls++;return Response.json(envelope("uncertain"));}) as typeof fetch);
 const engine=new Engine(new Store(":memory:"),{models:async()=>["muse-spark-test"],infer:async()=>{throw Error("Unexpected call");}},()=>now,new AgentProvider(),{},new SamProvider(),new ImageProvider(),provider);
 engines.push(engine);const {session}=engine.session();
 const input={condition:"Lamp off",photo:"data:image/jpeg;base64,photo",capturedAt:now,epoch:session.epoch,model:"muse-spark-test",requestId:randomUUID()};
 await expect(engine.checkCondition(session,input)).rejects.toMatchObject({code:"MODEL_REQUIRED"});await engine.connect(session,"TEST_ONLY_KEY");input.epoch=session.epoch;
 await expect(engine.checkCondition(session,{...input,capturedAt:now-6000})).rejects.toMatchObject({code:"STALE"});
 await expect(engine.checkCondition(session,{...input,model:"other-model"})).rejects.toMatchObject({code:"MODEL_REQUIRED"});
 session.calls=100;await expect(engine.checkCondition(session,input)).rejects.toMatchObject({code:"APP_LIMIT"});expect(calls).toBe(0);
 session.calls=0;expect(await engine.checkCondition(session,input)).toMatchObject({verdict:"uncertain",epoch:session.epoch,capturedAt:now});
 await expect(engine.checkCondition(session,input)).rejects.toMatchObject({code:"DUPLICATE"});expect(calls).toBe(1);expect(session.agentHistory).toEqual([]);
});
