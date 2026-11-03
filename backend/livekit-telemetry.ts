const numericFields=["durationMs","ttftMs","ttfbMs","audioDurationMs","totalTokens","promptTokens","completionTokens","reasoningTokens","endOfUtteranceDelayMs","transcriptionDelayMs","onUserTurnCompletedDelayMs","lastSpeakingTimeMs"];
/** An allowlist prevents prompts/transcripts/provider payloads entering our timing logs. */
export function livekitMetric(metric:Record<string,unknown>,now=Date.now()){
  const result:Record<string,number|string|boolean>={type:String(metric.type),at:now};
  for(const field of numericFields){const value=metric[field];if(typeof value==="number"&&Number.isFinite(value))result[field]=value;}
  if(typeof metric.cancelled==="boolean")result.cancelled=metric.cancelled;
  if(typeof metric.speechId==="string"&&/^speech_[a-zA-Z0-9_-]{1,80}$/.test(metric.speechId))result.speechId=metric.speechId;
  return result;
}
