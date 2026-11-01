import {expect,it} from "vitest";
import {updateLiveKitTranscript,type LiveKitLine} from "../src/livekit-transcripts";
import {safeLiveKitLog} from "../server/livekit-log";
import {livekitMetric} from "../server/livekit-telemetry";
import {livekitWorkerOptions} from "../server/livekit-worker-options";

it("replaces interim segments and prevents older streams from overwriting a final turn",()=>{
  const partial:LiveKitLine={id:"tester:one",who:"You",text:"Which rides",final:false,revision:1};
  let lines=updateLiveKitTranscript([],partial);
  lines=updateLiveKitTranscript(lines,{...partial,text:"Which rides should we try?",final:true,revision:3});
  lines=updateLiveKitTranscript(lines,{...partial,text:"Which rides should",revision:2});
  expect(lines).toHaveLength(1);expect(lines[0].text).toBe("Which rides should we try?");
  lines=updateLiveKitTranscript(lines,{...partial,text:"Which rides",revision:4});
  expect(lines[0].final).toBe(true);
  lines=updateLiveKitTranscript(lines,{...partial,id:"tester:two",revision:5});
  expect(lines).toHaveLength(2); // Repeated words in a different real turn must remain.
});
it("keeps transcript order stable, drops empty updates, and bounds retained lines",()=>{
  let lines:LiveKitLine[]=[];
  for(let n=0;n<70;n++)lines=updateLiveKitTranscript(lines,{id:String(n),who:"You",text:"Test",final:true,revision:n});
  expect(lines).toHaveLength(60);expect(lines[0].id).toBe("10");
  expect(updateLiveKitTranscript(lines,{id:"empty",who:"Glint",text:" ",final:true,revision:71})).toBe(lines);
});
it("drops SDK transcript fields at every severity and keeps only classified warnings",()=>{
  const privateText="PRIVATE_TEST_SPEECH",secret="TEST_ONLY_SECRET";
  expect(safeLiveKitLog(JSON.stringify({level:30,msg:privateText,"lk.pii.message":privateText}))).toBeNull();
  const warning=safeLiveKitLog(JSON.stringify({level:40,time:123,msg:privateText,"lk.pii.user_input":privateText,error:{message:secret}}))!;
  expect(warning).toContain("sdk-warning");expect(warning).not.toContain(privateText);expect(warning).not.toContain(secret);
  expect(safeLiveKitLog(privateText)).not.toContain(privateText);
  expect(safeLiveKitLog(JSON.stringify({level:40,error:{message:"runner initialization timed out"}}))).toContain("runner-init-timeout");
});
it("keeps cancellation and end-of-turn timings without storing model content",()=>{
  const metric=livekitMetric({type:"llm_metrics",cancelled:true,completionTokens:42,reasoningTokens:30,speechId:"speech_test",transcript:"PRIVATE_TEST_TEXT",endOfUtteranceDelayMs:800},123);
  expect(metric).toMatchObject({cancelled:true,completionTokens:42,reasoningTokens:30,endOfUtteranceDelayMs:800,speechId:"speech_test"});
  const logged=safeLiveKitLog(`[glint-livekit] ${JSON.stringify({...metric,transcript:"PRIVATE_TEST_TEXT"})}`)!;
  expect(logged).toContain('"cancelled":true');expect(logged).not.toContain("PRIVATE_TEST_TEXT");
});
it("actually disables idle warm processes in production and holds the selected log level",()=>{
  const config={url:"wss://test.livekit.cloud",apiKey:"TEST_ONLY_KEY",apiSecret:"TEST_ONLY_SECRET",accessCode:"TEST_ONLY_ACCESS",agentName:"glint-prototype"};
  for(const production of [true,false]){
    const options=livekitWorkerOptions(config,production);
    expect(options.numIdleProcesses).toBe(0);expect(options.logLevel).toBe("warn");expect(options.initializeProcessTimeout).toBe(60000);
  }
});
