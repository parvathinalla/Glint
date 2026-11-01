import { useEffect, useRef, useState } from "react";
import type { LookPreviewResult } from "../shared/look-preview";

async function jpegPhoto(blob: Blob): Promise<string> {
  if(!["image/jpeg","image/png","image/webp"].includes(blob.type) || blob.size>10000000)
    throw Error("Choose a JPEG, PNG or WebP photo smaller than 10 MB.");
  const image=await createImageBitmap(blob);
  try {
    const scale=Math.min(1,1024/Math.max(image.width,image.height));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    const ctx=canvas.getContext("2d");if(!ctx)throw Error("Photo processing is unavailable in this browser.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const photo=canvas.toDataURL("image/jpeg",.8);
    if(photo.length>800000)throw Error("This photo is too large. Choose a smaller photo.");
    return photo;
  } finally {image.close();}
}

export function LookPreview({request,accepted,onAccept,onDismiss,onIdeas,onPromptChange,generate,cancel}: {
  request:string;accepted:boolean;onAccept:()=>void;onDismiss:()=>void;onIdeas:()=>void;
  onPromptChange:(prompt:string)=>void;
  generate:(photo:string,prompt:string)=>Promise<LookPreviewResult>;cancel:()=>void;
}) {
  const [photo,setPhoto]=useState(""),[result,setResult]=useState("");
  const prompt=request;
  const [busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState("");
  const alive=useRef(true),selection=useRef(0),job=useRef(0),working=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;selection.current++;job.current++;};},[]);
  async function select(file?:File){
    if(!file)return;const token=++selection.current;setPreparing(true);setError("");
    try{const next=await jpegPhoto(file);if(alive.current&&token===selection.current){setPhoto(next);setResult("");}}
    catch(error){if(alive.current&&token===selection.current)setError(error instanceof Error?error.message:"This photo could not be opened.");}
    finally{if(alive.current&&token===selection.current)setPreparing(false);}
  }
  async function create(){
    if(working.current||preparing||!photo||prompt.trim().length<3)return;
    working.current=true;const token=++job.current;
    setBusy(true);setError("");
    try{
      // Refinements reattach only the last displayed preview, without server storage.
      const source=result?await jpegPhoto(await(await fetch(result)).blob()):photo;
      if(!alive.current||job.current!==token)return;
      const next=await generate(source,prompt.trim());
      if(alive.current&&job.current===token)setResult(next.image);
    }catch(error){if(alive.current&&job.current===token)setError(error instanceof Error?error.message:"The preview could not finish.");}
    finally{if(alive.current&&job.current===token){working.current=false;setBusy(false);}}
  }
  return <section className="glint-tracking-card glint-look-card" aria-label="Look preview">
    <p className="glint-eyebrow">MUSE IMAGE · PHOTO PREVIEW</p>
    {!accepted?<>
      <h3>Want to see the look on your photo?</h3>
      <p>Choose a look and a photo. Nothing is captured or sent until you press Generate preview.</p>
      <div className="glint-card-actions"><button className="glint-primary" onClick={onAccept}>Yes, choose a photo</button><button className="glint-text" onClick={onIdeas}>No, just ideas</button><button className="glint-text" onClick={onDismiss}>Not now</button></div>
    </>:<>
      <h3>{busy?"Creating your preview…":"Create your look"}</h3>
      <div className="glint-look-photos">
        {photo&&<figure><img src={photo} alt="Selected reference photo"/><figcaption>Your chosen photo</figcaption></figure>}
        {result&&<figure><img src={result} alt="Generated look preview"/><figcaption>AI-generated preview · Muse Image</figcaption></figure>}
      </div>
      <fieldset disabled={busy||preparing}>
        <legend>Photo and look</legend>
        <label className="glint-text">{photo?"Replace photo":"Choose a photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{void select(event.target.files?.[0]);event.target.value="";}}/></label>
        <label className="glint-text">Take a photo<input type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={event=>{void select(event.target.files?.[0]);event.target.value="";}}/></label>
        <label className="glint-look-prompt">{result?"What would you like to change?":"Describe the look"}<textarea value={prompt} maxLength={1500} onChange={event=>onPromptChange(event.target.value)} placeholder="For example: a celestial witch costume with soft silver makeup"/></label>
      </fieldset>
      <small>Your photo is sent to Meta only when you generate. Glint keeps photos and previews in this page’s memory; it does not save them to its database. Each generation uses your connected key and one session call.</small>
      {preparing&&<p role="status">Preparing your photo…</p>}
      {error&&<p role="alert">{error}</p>}
      <div className="glint-card-actions">
        {!busy&&<button className="glint-primary" disabled={preparing||!photo||prompt.trim().length<3} onClick={()=>void create()}>{result?"Generate updated preview":"Generate preview"}</button>}
        {busy&&<button className="glint-text" onClick={()=>{job.current++;working.current=false;setBusy(false);setError("Preview canceled.");cancel();}}>Cancel generation</button>}
        {!busy&&result&&<a className="glint-text" href={result} download={`glint-look.${result.startsWith("data:image/png")?"png":result.startsWith("data:image/jpeg")?"jpg":"webp"}`}>Download preview</a>}
        {!busy&&<button className="glint-text" onClick={onDismiss}>Close preview</button>}
      </div>
    </>}
  </section>;
}
