import {fileURLToPath} from "node:url";
import {ServerOptions} from "@livekit/agents";
import type {LiveKitConfig} from "./livekit";

export function livekitWorkerOptions(config:LiveKitConfig,production:boolean){
  const options=new ServerOptions({agent:fileURLToPath(new URL("./livekit-agent.ts",import.meta.url)),production,
    agentName:config.agentName,wsURL:config.url,apiKey:config.apiKey,apiSecret:config.apiSecret,
    initializeProcessTimeout:60000,numIdleProcesses:1,logLevel:"warn"});
  // SDK 1.9.5 treats constructor value 0 as absent. Do not pass these options
  // through cli.runApp: it constructs a second ServerOptions and loses zero.
  options.numIdleProcesses=0;
  return options;
}
