import {fileURLToPath} from "node:url";
import dotenv from "dotenv";
import {AgentServer,ServerOptions,cli,initializeLogger} from "@livekit/agents";
import {livekitAgentConfig} from "./livekit-agent-config";
import {livekitWorkerOptions} from "./livekit-worker-options";

dotenv.config({path:[".env.local",".env"],quiet:true});
const args=process.argv.slice(2);
if(args.includes("--help")){
  console.info("[glint-livekit] "+JSON.stringify({type:"worker_help",commands:"start, dev, download-files"}));
}else{
  const config=livekitAgentConfig();
  const agent=fileURLToPath(new URL("./livekit-agent.ts",import.meta.url));
  const command=args[0]||"start";
  if(command==="download-files")cli.runApp(new ServerOptions({agent}));
  else if(command!=="start"&&command!=="dev")throw Error("Use start, dev, or download-files.");
  else{
    initializeLogger({pretty:false,level:"warn"});
    const options=livekitWorkerOptions(config,command==="start");
    const server=new AgentServer(options);
    server.event.on("worker_registered",()=>console.info(`[glint-livekit] ${JSON.stringify({type:"worker_ready",at:Date.now()})}`));
    let closing=false;
    const close=async()=>{if(closing)return;closing=true;await server.drain(30000).catch(()=>{});await server.close();};
    process.on("SIGTERM",()=>void close());process.on("SIGINT",()=>void close());
    await server.run();
  }
}
