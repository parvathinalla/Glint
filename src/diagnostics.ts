import {DiagnosticBuffer,diagnosticOperation,diagnosticEvent,type TraceInput} from "../shared/diagnostics";
export const clientDiagnostics=new DiagnosticBuffer();
export function traceClient(event:TraceInput){clientDiagnostics.record(event);}
export async function tracedFetch(path:string,input:RequestInfo|URL,init?:RequestInit){
  if(path.startsWith("diagnostics")||path==="voice-diagnostics")return fetch(input,init);
  const operation=diagnosticOperation(path),started=performance.now();
  traceClient({stage:"request-start",operation});
  try{
    const response=await fetch(input,init);
    const id=diagnosticEvent.shape.requestId.safeParse(response.headers.get("x-glint-request-id"));
    traceClient({stage:"request-end",operation,status:response.status,durationMs:Math.round(performance.now()-started),...(id.success?{requestId:id.data}:{})});
    return response;
  }catch(error){
    traceClient({stage:"request-error",operation,reason:init?.signal?.aborted?"canceled":"network",durationMs:Math.round(performance.now()-started)});throw error;
  }
}
