import {expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({closed:0,frames:0}));
vi.mock("@livekit/agents",()=>({initializeLogger:vi.fn(),inference:{TTS:class{
  stream(){return {pushText(){},endInput(){},close(){state.closed++;},async *[Symbol.asyncIterator](){state.frames++;yield {frame:{sampleRate:24000,channels:1,data:new Int16Array([0,16384,-32768])}};}};}
  async close(){state.closed++;}
}}}));
import {createLiveKitVoice} from "../server/tts-livekit.ts";
const env={GLINT_LIVEKIT_TTS_MODEL:"cartesia/sonic-3",GLINT_LIVEKIT_TTS_VOICE:"test",LIVEKIT_API_KEY:"test",LIVEKIT_API_SECRET:"test"};
it("converts cloud PCM and releases stream and connections",async()=>{
  state.closed=0;const sample=await createLiveKitVoice(env).synth("Hello");
  expect([...sample.samples]).toEqual([0,0.5,-1]);expect(sample.sampleRate).toBe(24000);expect(state.closed).toBe(2);
});
it("rejects missing configuration and canceled requests before synthesis",async()=>{
  expect(()=>createLiveKitVoice({})).toThrow("configuration");
  state.frames=0;await expect(createLiveKitVoice(env).synth("Hello",AbortSignal.abort())).rejects.toBeDefined();expect(state.frames).toBe(0);
});
