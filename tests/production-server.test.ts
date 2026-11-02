import {expect,it} from "vitest";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {once} from "node:events";
import {existsSync,mkdirSync,mkdtempSync,rmSync} from "node:fs";
import {resolve,dirname} from "node:path";

it("starts the production server with cloud binding, provider-free health and secure sessions",async()=>{
  const probe=createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");
  const port=(probe.address() as {port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
  const scratch=resolve(".tmp-test");mkdirSync(scratch,{recursive:true});const data=mkdtempSync(resolve(scratch,"production-"));
  const child=spawn(process.execPath,["--import","tsx","server/index.ts","--production"],{
    env:{...process.env,PORT:String(port),HOST:"0.0.0.0",APP_ORIGIN:"https://glint.test",NODE_ENV:"production",GLINT_DATA_DIR:data,
      GLINT_TTS_PROVIDER:"livekit",GLINT_TTS_MOCK:"1",GLINT_LIVEKIT_ENABLED:"0",GLINT_LIVEKIT_AGENT_ENABLED:"0",
      LIVEKIT_API_KEY:"TEST_ONLY_KEY",LIVEKIT_API_SECRET:"TEST_ONLY_SECRET",GLINT_LIVEKIT_TTS_MODEL:"test/tts",GLINT_LIVEKIT_TTS_VOICE:"test-voice"},
    stdio:["ignore","pipe","pipe"],windowsHide:true,
  });
  let output="";child.stdout.on("data",chunk=>{output+=chunk;});child.stderr.on("data",chunk=>{output+=chunk;});
  const base=`http://127.0.0.1:${port}`;
  try{
    let ready=false;
    for(let attempt=0;attempt<200;attempt++){
      if(child.exitCode!==null)throw Error(`Production process exited: ${output}`);
      try{ready=(await fetch(base+"/healthz",{signal:AbortSignal.timeout(500)})).ok;}catch{/* wait for startup */}
      if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));
    }
    expect(ready,output).toBe(true);
    const health=await fetch(base+"/healthz");expect(await health.json()).toEqual({status:"ok"});expect(health.headers.get("set-cookie")).toBeNull();
    const session=await fetch(base+"/api/session");expect(session.status).toBe(200);expect(session.headers.get("set-cookie")).toContain("Secure");
    expect((await fetch(base+"/.env.local")).status).toBe(403);
    if(existsSync(resolve("dist/index.html"))){const home=await fetch(base+"/");expect(home.status).toBe(200);expect(home.headers.get("content-type")).toContain("text/html");}
  }finally{
    if(child.exitCode===null){const exited=once(child,"exit");child.kill();await exited;}
    // Delete only the exact temporary directory created under this workspace.
    if(dirname(resolve(data))===scratch)rmSync(data,{recursive:true,force:true});
  }
},40000);
