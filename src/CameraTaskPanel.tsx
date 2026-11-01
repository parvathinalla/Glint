import {useEffect,useRef,useState} from "react";
import type {CameraTaskEvent} from "./camera-task-runner";
export function CameraTaskPanel({task,onClose,onCancel,onOpenCamera}:{task:CameraTaskEvent|null;onClose:()=>void;onCancel:()=>void;onOpenCamera:()=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [opening,setOpening]=useState(false);
 const show=!!task&&["result","error"].includes(task.state);
 useEffect(()=>{if(show&&!dialog.current?.open)dialog.current?.showModal();else if(!show)dialog.current?.close();},[show,task?.id]);
 return <>
  {task&&!show&&<aside className="glint-task-status" aria-label="Camera task status" role="status"><strong>{task.title}</strong><p>{task.detail}</p>{task.deadline&&<small>Check at {new Date(task.deadline).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})} · keep this page visible</small>}{task.state==="needs-camera"&&<button className="glint-primary" disabled={opening} onClick={()=>{setOpening(true);void onOpenCamera().finally(()=>setOpening(false));}}>Open camera for this task</button>}<button className="glint-text" onClick={onCancel}>Cancel camera task</button></aside>}
  <dialog ref={dialog} className="glint-sheet glint-task-result" aria-label="Camera task result" onCancel={onClose}>
   {task&&show&&<><header className="glint-sheet-header"><h2>{task.title}</h2><button className="glint-round" aria-label="Close camera result" onClick={onClose}>×</button></header><div className="glint-task-body">
    {task.image&&<div className="glint-marked-image"><img src={task.image} alt={task.kind==="generated"?"Generated camera image":task.kind==="annotated"?"Captured camera evidence with numbered marks":"Captured camera check evidence"}/>{!!task.marks?.length&&<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{task.marks.map((mark,index)=><g key={index}><rect x={mark.x*100} y={mark.y*100} width={mark.width*100} height={mark.height*100}/><text x={mark.x*100+1} y={mark.y*100+4}>{index+1}</text></g>)}</svg>}</div>}
    {task.kind!=="generated"&&<p>{task.detail}</p>}{!!task.marks?.length&&<ol>{task.marks.map((mark,index)=><li key={index}>{mark.label}</li>)}</ol>}
    {task.kind==="annotated"&&<small>Marks indicate model observations on the captured frame, not a generated replacement or a calibrated measurement.</small>}
    {task.image&&<a className="glint-text" href={task.image} download={`glint-${task.kind}.${task.image.startsWith("data:image/png")?"png":task.image.startsWith("data:image/jpeg")?"jpg":"webp"}`}>{task.kind==="annotated"?"Download source frame":"Download image"}</a>}
   </div></>}
  </dialog>
 </>;
}
