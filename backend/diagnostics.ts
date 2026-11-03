import {randomUUID} from "node:crypto";
import {DiagnosticBuffer,type TraceInput} from "../shared/diagnostics";
const sessions=new WeakMap<object,{id:string;events:DiagnosticBuffer;client:DiagnosticBuffer}>();
function trace(session:object){
  let value=sessions.get(session);
  if(!value){value={id:randomUUID(),events:new DiagnosticBuffer(),client:new DiagnosticBuffer()};sessions.set(session,value);}
  return value;
}
export function traceServer(session:object,event:TraceInput){
  const value=trace(session),record=value.events.record(event);
  if(record)console.info(`[glint-trace] ${JSON.stringify({trace:value.id,...record})}`);
}
export function acceptClientTrace(session:object,events:unknown[]){
  const value=trace(session);
  for(const event of events){const record=value.client.accept(event);if(record)console.info(`[glint-client-trace] ${JSON.stringify({trace:value.id,...record})}`);}
}
export function sessionDiagnostics(session:object){
  const value=trace(session);return {version:1,trace:value.id,server:value.events.snapshot(),client:value.client.snapshot()};
}
