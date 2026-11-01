import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { AccessToken, RoomAgentDispatch, RoomConfiguration, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { z } from "zod";
import { Problem } from "./provider";

export const livekitJoin = z.object({ accessCode:z.string().min(1).max(256) }).strict();
export type LiveKitConfig = { url:string; apiKey:string; apiSecret:string; accessCode:string; agentName:string };
export function livekitConfig(env:NodeJS.ProcessEnv=process.env):LiveKitConfig|null {
  if(env.GLINT_LIVEKIT_ENABLED!=="1")return null;
  const {LIVEKIT_URL:url,LIVEKIT_API_KEY:apiKey,LIVEKIT_API_SECRET:apiSecret,GLINT_LIVEKIT_ACCESS_CODE:accessCode}=env;
  if(!url||!apiKey||!apiSecret||!accessCode||accessCode.length<16)return null;
  try {const parsed=new URL(url);if(parsed.protocol!=="wss:"||!parsed.hostname.endsWith(".livekit.cloud")||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=="/")return null;}catch{return null;}
  return {url,apiKey,apiSecret,accessCode,agentName:env.GLINT_LIVEKIT_AGENT_NAME||"glint-prototype"};
}
const digest=(value:string)=>createHash("sha256").update(value).digest();
type Lease={room:string;identity:string;attempts:number;window:number;active:boolean};
/** Prototype only: same private cookie session owns one opaque room. No cloud calls until explicit join. */
export class LiveKitSessions {
  private leases=new WeakMap<object,Lease>();
  constructor(private config:()=>LiveKitConfig|null=livekitConfig,private now=Date.now,
    private removeRoom:(config:LiveKitConfig,room:string)=>Promise<void>=async(config,room)=>{
      const client=new RoomServiceClient(config.url.replace(/^wss:/,"https:"),config.apiKey,config.apiSecret);
      await client.deleteRoom(room);
    }){}
  get available(){return !!this.config();}
  async join(owner:object,code:string){
    const config=this.config();if(!config)throw new Problem(503,"LIVEKIT_DISABLED","LiveKit prototype is not configured yet.");
    let lease=this.leases.get(owner);
    if(!lease){lease={room:`glint-${randomUUID()}`,identity:`tester-${randomUUID()}`,attempts:0,window:this.now(),active:false};this.leases.set(owner,lease);}
    if(this.now()-lease.window>=60000){lease.attempts=0;lease.window=this.now();}
    if(++lease.attempts>5)throw new Problem(429,"LIVEKIT_LIMIT","Wait a minute before trying to join again.");
    if(!timingSafeEqual(digest(code),digest(config.accessCode)))throw new Problem(403,"LIVEKIT_ACCESS","The prototype access code was not accepted.");
    const token=new AccessToken(config.apiKey,config.apiSecret,{identity:lease.identity,ttl:300});
    token.addGrant({roomJoin:true,room:lease.room,canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources:[TrackSource.MICROPHONE]});
    token.roomConfig=new RoomConfiguration({emptyTimeout:60,departureTimeout:20,maxParticipants:2,agents:[new RoomAgentDispatch({agentName:config.agentName})]});
    const participantToken=await token.toJwt();lease.active=true;
    return {serverUrl:config.url,participantToken,roomName:lease.room,expiresIn:300};
  }
  async end(owner:object){
    const lease=this.leases.get(owner),config=this.config();if(!lease||!lease.active||!config)return;
    // A failed delete can be retried; never report a closed cloud room on failure.
    try {await this.removeRoom(config,lease.room);}catch{throw new Problem(502,"LIVEKIT_CLOSE","The browser disconnected, but cloud room cleanup failed. Retry End session.");}
    // Keep the attempt window across disconnects so repeated joins cannot reset it.
    lease.active=false;lease.room=`glint-${randomUUID()}`;lease.identity=`tester-${randomUUID()}`;
  }
}
