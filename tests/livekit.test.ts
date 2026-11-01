import {afterEach,expect,it} from "vitest";
import {createServer,type Server} from "node:http";
import {once} from "node:events";
import {TokenVerifier} from "livekit-server-sdk";
import {LiveKitSessions,livekitConfig,type LiveKitConfig} from "../server/livekit";
import {livekitAgentConfig} from "../server/livekit-agent-config";
import {createApp} from "../server/app";
import {Engine} from "../server/engine";
import {Store} from "../server/store";

const config:LiveKitConfig={url:"wss://test.livekit.cloud",apiKey:"test-key",apiSecret:"TEST_ONLY_SECRET_AT_LEAST_32_CHARACTERS",accessCode:"TEST_ONLY_ACCESS_CODE",agentName:"glint-prototype"};
const env={GLINT_LIVEKIT_ENABLED:"1",LIVEKIT_URL:config.url,LIVEKIT_API_KEY:config.apiKey,LIVEKIT_API_SECRET:config.apiSecret,GLINT_LIVEKIT_ACCESS_CODE:config.accessCode};
it("stays off by default and rejects incomplete, weak or non-cloud configuration",()=>{
  expect(livekitConfig({})).toBeNull();expect(livekitConfig(env)).toMatchObject(config);
  for(const patch of [{GLINT_LIVEKIT_ENABLED:"0"},{LIVEKIT_API_SECRET:""},{GLINT_LIVEKIT_ACCESS_CODE:"short"},{LIVEKIT_URL:"wss://evil.test"},{LIVEKIT_URL:"wss://test.livekit.cloud.evil.test"},{LIVEKIT_URL:"wss://user:pass@test.livekit.cloud"}])expect(livekitConfig({...env,...patch})).toBeNull();
});
it("issues short-lived, room-scoped microphone-only tokens without provider secrets",async()=>{
  const sessions=new LiveKitSessions(()=>config),owner={};
  const result=await sessions.join(owner,config.accessCode),again=await sessions.join(owner,config.accessCode);
  const claims=await new TokenVerifier(config.apiKey,config.apiSecret).verify(result.participantToken);
  expect(result.roomName).toBe(again.roomName);expect(claims.sub).toMatch(/^tester-/);
  expect(claims.video).toMatchObject({room:result.roomName,roomJoin:true,canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources:["microphone"]});
  expect(claims.video).not.toHaveProperty("roomAdmin");expect(Number(claims.exp)-Number(claims.nbf)).toBeLessThanOrEqual(300);
  expect(JSON.stringify(result)).not.toContain(config.apiSecret);expect(JSON.stringify(result)).not.toContain(config.accessCode);
  const payload=JSON.parse(Buffer.from(result.participantToken.split(".")[1],"base64url").toString());
  expect(payload.roomConfig.agents[0].agentName).toBe(config.agentName);
  expect((await sessions.join({},config.accessCode)).roomName).not.toBe(result.roomName);
});
it("rate-limits invalid attempts and can retry a failed cloud-room cleanup",async()=>{
  let clock=0,removals=0;const sessions=new LiveKitSessions(()=>config,()=>clock,async()=>{if(++removals===1)throw Error("provider detail must stay private");}),owner={};
  for(let n=0;n<5;n++)await expect(sessions.join(owner,"wrong")).rejects.toMatchObject({status:403});
  await sessions.end(owner);expect(removals).toBe(0);
  await expect(sessions.join(owner,config.accessCode)).rejects.toMatchObject({status:429});clock=60001;
  await sessions.join(owner,config.accessCode);
  await expect(sessions.end(owner)).rejects.toMatchObject({code:"LIVEKIT_CLOSE"});await sessions.end(owner);await sessions.end(owner);expect(removals).toBe(2);
});
it("requires explicit worker and model configuration rather than silently buying inference",()=>{
  expect(()=>livekitAgentConfig(env)).toThrow("GLINT_LIVEKIT_AGENT_ENABLED");
  expect(()=>livekitAgentConfig({...env,GLINT_LIVEKIT_AGENT_ENABLED:"1"})).toThrow("Missing prototype settings");
  const agentEnv={...env,GLINT_LIVEKIT_AGENT_ENABLED:"1",GLINT_LIVEKIT_STT_MODEL:"test/stt",GLINT_LIVEKIT_TTS_MODEL:"test/tts",GLINT_LIVEKIT_TTS_VOICE:"test-voice",GLINT_LIVEKIT_LLM_PROVIDER:"baseten",GLINT_LIVEKIT_LLM_MODEL:"meta-models/muse-spark-open-1026",BASETEN_API_KEY:"TEST_ONLY_KEY"};
  expect(livekitAgentConfig(agentEnv)).toMatchObject({llmURL:"https://inference.baseten.co/v1",llmModel:"meta-models/muse-spark-open-1026"});
});

let server:Server|undefined,engine:Engine|undefined;
afterEach(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));engine?.close();server=undefined;engine=undefined;});
it("protects token and cleanup routes with the existing cookie, origin and CSRF boundary",async()=>{
  engine=new Engine(new Store(":memory:"),{models:async()=>[],infer:async()=>{throw Error("No live model calls");}});
  const rooms=new LiveKitSessions(()=>config,Date.now,async()=>{});
  server=createServer(createApp(engine,"http://glint.test",false,rooms));server.listen(0,"127.0.0.1");await once(server,"listening");
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const initial=await fetch(base+"/api/session"),cookie=initial.headers.get("set-cookie")!.split(";")[0],session=await initial.json();
  const call=(headers:Record<string,string>,body:unknown={accessCode:config.accessCode})=>fetch(base+"/api/livekit/token",{method:"POST",headers:{"Content-Type":"application/json",Origin:"http://glint.test",...headers},body:JSON.stringify(body)});
  expect((await call({})).status).toBe(401);expect((await call({Cookie:cookie})).status).toBe(403);
  const authorized={Cookie:cookie,"x-glint-csrf":session.csrf};
  expect((await call({...authorized,Origin:"http://evil.test"})).status).toBe(403);
  expect((await call(authorized,{accessCode:"wrong"})).status).toBe(403);
  expect((await call(authorized,{accessCode:config.accessCode,room:"arbitrary-room"})).status).toBe(400);
  const joined=await call(authorized);expect(joined.status).toBe(200);expect(joined.headers.get("cache-control")).toBe("no-store");
  expect(await (await fetch(base+"/api/livekit/config",{headers:{Cookie:cookie}})).json()).toEqual({enabled:true});
  expect((await fetch(base+"/api/livekit/session",{method:"DELETE",headers:{...authorized,Origin:"http://glint.test"}})).status).toBe(200);
});
