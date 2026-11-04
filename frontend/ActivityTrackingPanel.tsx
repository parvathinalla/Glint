import type {ActivityState} from "./activity-monitor";
export function ActivityTrackingPanel({state,poseStatus,onStart,onStop,onResume,onDismiss}:{state:ActivityState|null;poseStatus?:string;onStart:(checkpoints:string[])=>void;onStop:()=>void;onResume:()=>void;onDismiss:()=>void}){
  if(!state||state.phase==="result")return null;
  if(state.phase!=="confirmation")return <aside className="glint-activity-controls" aria-label="Activity tracking">
    {state.mode==="hand_raises"&&<output aria-label="Hand raise count" aria-live="polite" title={state.status}>{poseStatus==="unavailable"||poseStatus==="off"?"Tracker unavailable":poseStatus==="loading"?"Loading tracker":state.status.startsWith("Move ")?"Move into view":state.status.startsWith("Waiting ")?"Tracker waiting":`${state.local?.count??0} raises`}</output>}
    {state.phase==="paused"&&<button onClick={onResume}>Resume tracking</button>}
    <button aria-label="Stop tracking" onClick={onStop}>Stop</button>
  </aside>;
  return <aside className="glint-activity-panel" aria-label="Activity tracking">
    <h3>{state.mode==="hand_raises"?"Should I count your hand raises?":"Should I track this activity?"}</h3>
    <button className="glint-primary" onClick={()=>onStart(state.checkpoints)}>Start tracking</button>
    <button className="glint-text" onClick={onDismiss}>Not now</button>
  </aside>;
}
