import {spawn} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {safeLiveKitLog} from "./livekit-log";

const child=spawn(process.execPath,["--import","tsx",fileURLToPath(new URL("./livekit-worker.ts",import.meta.url)),...process.argv.slice(2)],{stdio:["ignore","pipe","pipe"],windowsHide:true});
mkdirSync(".data/livekit",{recursive:true});
writeFileSync(".data/livekit/runtime.json",JSON.stringify({runnerPid:process.pid,workerPid:child.pid}));
for(const stream of [child.stdout,child.stderr]){
  let pending="";
  const emit=(line:string)=>{const safe=safeLiveKitLog(line);if(safe)console.info(safe);};
  stream.setEncoding("utf8");
  stream.on("data",chunk=>{pending+=chunk;let index:number;while((index=pending.indexOf("\n"))>=0){emit(pending.slice(0,index));pending=pending.slice(index+1);}if(pending.length>65536){emit("oversized SDK output");pending="";}});
  stream.on("end",()=>{if(pending)emit(pending);});
}
child.on("error",()=>{console.error('[glint-livekit] {"type":"worker_start_failed"}');process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code??1;});
process.on("SIGINT",()=>child.kill("SIGINT"));process.on("SIGTERM",()=>child.kill("SIGTERM"));
