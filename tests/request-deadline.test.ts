import {afterEach,expect,it,vi} from "vitest";
import {withRequestDeadline} from "../src/request-deadline";
afterEach(()=>vi.useRealTimers());
it("aborts a hung request and bounds a transport that ignores cancellation",async()=>{
  vi.useFakeTimers();let signal!:AbortSignal;let release!:(value:string)=>void;
  const result=withRequestDeadline(s=>{signal=s;return new Promise<string>(resolve=>release=resolve);},5000);
  const rejected=expect(result).rejects.toMatchObject({name:"TimeoutError"});
  await vi.advanceTimersByTimeAsync(5000);await rejected;expect(signal.aborted).toBe(true);
  release("late response");await Promise.resolve();
});
it("returns successful results and removes its deadline",async()=>{
  vi.useFakeTimers();expect(await withRequestDeadline(async()=>"ready",5000)).toBe("ready");expect(vi.getTimerCount()).toBe(0);
});
it("propagates cancellation without starting an already canceled operation",async()=>{
  const operation=vi.fn(async()=>"unused");await expect(withRequestDeadline(operation,5000,AbortSignal.abort())).rejects.toMatchObject({name:"AbortError"});expect(operation).not.toHaveBeenCalled();
});
