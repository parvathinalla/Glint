import {expect,it,vi} from "vitest";
import {DiagnosticBuffer,diagnosticOperation} from "../shared/diagnostics";
import {acceptClientTrace,sessionDiagnostics,traceServer} from "../server/diagnostics";

it("rejects content and arbitrary labels before storing or emitting diagnostics",()=>{
  const log=new DiagnosticBuffer(()=>100);
  for(const extra of [{text:"private"},{key:"private"},{audio:"private"},{image:"private"},{reason:"private"},{operation:"https://private.example"},{durationMs:Infinity}])
    expect(log.accept({at:100,stage:"task",...extra})).toBeNull();
  expect(log.snapshot()).toEqual([]);
  expect(diagnosticOperation("private/path")).toBe("other");
});
it("bounds history and upload batches and returns independent snapshots",()=>{
  const log=new DiagnosticBuffer(()=>100,500);
  for(let turn=0;turn<900;turn++)log.record({stage:"voice",turn});
  expect(log.snapshot()).toHaveLength(500);
  expect(log.snapshot()[0].turn).toBe(400);
  expect(log.takeBatch()).toHaveLength(40);
  const snapshot=log.snapshot();snapshot[0].turn=9999;
  expect(log.snapshot()[0].turn).toBe(400);
});
it("isolates session traces and excludes rejected client fields from server logs",()=>{
  const spy=vi.spyOn(console,"info").mockImplementation(()=>{});
  try{
    const first={},second={};traceServer(first,{stage:"provider-error",operation:"image",reason:"provider"});
    acceptClientTrace(first,[{at:100,stage:"task",state:"result"},{at:100,stage:"task",text:"SECRET_CONTENT"}]);
    expect(sessionDiagnostics(first).server).toHaveLength(1);
    expect(sessionDiagnostics(first).client).toHaveLength(1);
    expect(sessionDiagnostics(second).server).toEqual([]);
    expect(sessionDiagnostics(second).client).toEqual([]);
    expect(sessionDiagnostics(first).trace).not.toBe(sessionDiagnostics(second).trace);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRET_CONTENT");
  }finally{spy.mockRestore();}
});
