const states=new Set(["thinking","speaking","listening","initializing","idle","away"]);
const metricTypes=new Set(["llm_metrics","stt_metrics","tts_metrics","eou_metrics","vad_metrics","interruption_metrics"]);
const numericFields=["at","durationMs","ttftMs","ttfbMs","audioDurationMs","totalTokens","promptTokens","completionTokens","reasoningTokens","endOfUtteranceDelayMs","transcriptionDelayMs","onUserTurnCompletedDelayMs","lastSpeakingTimeMs"];
/** Never forward raw SDK logs: even warning fields may contain transcript text. */
export function safeLiveKitLog(line:string):string|null{
  if(!line.trim())return null;
  if(line.length>65536)return '[glint-livekit] {"type":"sdk_output_omitted"}';
  try{
    const own=line.startsWith("[glint-livekit] ");
    const value=JSON.parse(own?line.slice(16):line) as Record<string,unknown>;
    if(own){
      const result:Record<string,unknown>={};
      if(metricTypes.has(String(value.type))||["agent_state_changed","user_state_changed","worker_ready","worker_help"].includes(String(value.type)))result.type=value.type;
      else return null;
      for(const key of numericFields)if(typeof value[key]==="number"&&Number.isFinite(value[key]))result[key]=value[key];
      if(typeof value.cancelled==="boolean")result.cancelled=value.cancelled;
      if(typeof value.state==="string"&&states.has(value.state))result.state=value.state;
      if(typeof value.speechId==="string"&&/^speech_[a-zA-Z0-9_-]{1,80}$/.test(value.speechId))result.speechId=value.speechId;
      return `[glint-livekit] ${JSON.stringify(result)}`;
    }
    if(typeof value.level!=="number"||value.level<40)return null;
    const error=value.error as {message?:unknown}|null;
    const message=String(error?.message||value.msg||"");
    const reason=message.includes("runner initialization timed out")?"runner-init-timeout":
      message.includes("event loop blocked")?"event-loop-blocked":
      message.includes("failed to measure CPU load")?"cpu-measurement-failed":
      message.includes("failed to connect to LiveKit server")?"worker-connection-failed":
      message.includes("unresponsive")?"worker-unresponsive":
      message.includes("memory")?"worker-memory-warning":"sdk-warning";
    return `[glint-livekit] ${JSON.stringify({type:"sdk_warning",level:value.level,reason,...(typeof value.time==="number"?{at:value.time}:{})})}`;
  }catch{return '[glint-livekit] {"type":"sdk_output_omitted"}';}
}
