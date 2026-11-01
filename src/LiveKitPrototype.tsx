import {useEffect,useRef,useState} from "react";
import type {Room} from "livekit-client";
import "./livekit-prototype.css";

type Line={id:string;who:string;text:string};
/** Independent page: never starts the legacy mic, ASR, SpeechQueue, or VoicePlayer. */
export default function LiveKitPrototype(){
  const [ready,setReady]=useState<boolean|null>(null),[csrf,setCsrf]=useState("");
  const [code,setCode]=useState(""),[state,setState]=useState("Not connected"),[problem,setProblem]=useState("");
  const [joining,setJoining]=useState(false),[connected,setConnected]=useState(false),[muted,setMuted]=useState(false);
  const [agent,setAgent]=useState("Waiting for agent"),[lines,setLines]=useState<Line[]>([]);
  const room=useRef<Room|null>(null),attempt=useRef(0),controller=useRef<AbortController|null>(null),audio=useRef<HTMLDivElement>(null);
  const csrfRef=useRef("");csrfRef.current=csrf;
  async function endCloud(){
    const response=await fetch("/api/livekit/session",{method:"DELETE",headers:{"x-glint-csrf":csrfRef.current}});
    if(!response.ok)throw Error("Cloud room cleanup failed. Press End session to retry.");
  }
  useEffect(()=>{
    const cancel=new AbortController();
    void (async()=>{try{
      const session=await fetch("/api/session",{signal:cancel.signal});if(!session.ok)throw Error("Could not open a private session.");
      const view=await session.json();setCsrf(view.csrf);
      const response=await fetch("/api/livekit/config",{signal:cancel.signal});if(!response.ok)throw Error("Could not check LiveKit configuration.");
      const config=await response.json();setReady(config.enabled);
    }catch(error){if(!cancel.signal.aborted)setProblem(error instanceof Error?error.message:"Could not load configuration.");}})();
    return ()=>{cancel.abort();attempt.current++;controller.current?.abort();void room.current?.disconnect();
      if(csrfRef.current)void fetch("/api/livekit/session",{method:"DELETE",headers:{"x-glint-csrf":csrfRef.current},keepalive:true}).catch(()=>{});};
  },[]);
  async function stop(){
    attempt.current++;controller.current?.abort();await room.current?.disconnect();room.current=null;
    audio.current?.replaceChildren();setConnected(false);setJoining(false);setMuted(false);setAgent("Waiting for agent");setState("Disconnected");
    try{await endCloud();}catch(error){setProblem((error as Error).message);}
  }
  async function join(){
    const version=++attempt.current;const abort=new AbortController();controller.current=abort;
    setProblem("");setJoining(true);setState("Connecting");setLines([]);
    try{
      const response=await fetch("/api/livekit/token",{method:"POST",headers:{"Content-Type":"application/json","x-glint-csrf":csrf},body:JSON.stringify({accessCode:code}),signal:abort.signal});
      const result=await response.json();if(!response.ok)throw Error(result.message||"Could not join LiveKit.");
      const {Room,RoomEvent,Track}=await import("livekit-client");if(version!==attempt.current)return;
      const next=new Room({adaptiveStream:true,dynacast:true});room.current=next;
      next.on(RoomEvent.TrackSubscribed,(track)=>{if(version!==attempt.current||track.kind!==Track.Kind.Audio)return;audio.current?.append(track.attach());});
      next.on(RoomEvent.TrackUnsubscribed,track=>track.detach().forEach(element=>element.remove()));
      next.on(RoomEvent.ConnectionStateChanged,value=>{if(version===attempt.current)setState(value);});
      next.on(RoomEvent.ParticipantAttributesChanged,(_changed,participant)=>{if(version===attempt.current&&participant.attributes["lk.agent.state"])setAgent(participant.attributes["lk.agent.state"]);});
      next.on(RoomEvent.TranscriptionReceived,(segments,participant)=>{
        if(version!==attempt.current)return;
        setLines(previous=>{const updated=[...previous];for(const segment of segments){const line={id:segment.id,who:participant?.isLocal?"You":"Glint",text:segment.text};const index=updated.findIndex(item=>item.id===line.id);if(index>=0)updated[index]=line;else updated.push(line);}return updated.slice(-60);});
      });
      next.on(RoomEvent.Disconnected,()=>{if(version===attempt.current){setConnected(false);setMuted(false);setAgent("Waiting for agent");setState("Disconnected");audio.current?.replaceChildren();}});
      // Current agents publish transcription using text streams.
      next.registerTextStreamHandler("lk.transcription",async(reader,info)=>{
        const participant=info.identity===next.localParticipant.identity?"You":"Glint";
        let text="";for await(const chunk of reader){text+=chunk;if(version!==attempt.current)return;setLines(previous=>[...previous.filter(line=>line.id!==reader.info.id),{id:reader.info.id,who:participant,text}].slice(-60));}
      });
      await next.connect(result.serverUrl,result.participantToken);if(version!==attempt.current){await next.disconnect();return;}
      await next.startAudio().catch(()=>setProblem("Tap Enable speaker to allow audio playback."));
      await next.localParticipant.setMicrophoneEnabled(true);
      if(version!==attempt.current){await next.disconnect();return;}
      setConnected(true);setMuted(false);setCode("");setState("Connected");
    }catch(error){if(version===attempt.current){setProblem(error instanceof Error?error.message:"Connection failed.");await room.current?.disconnect();room.current=null;audio.current?.replaceChildren();setState("Disconnected");void endCloud().catch(()=>{});}}
    finally{if(version===attempt.current)setJoining(false);}
  }
  return <main className="livekit-prototype"><a href="/">← Return to Glint</a><h1>Glint LiveKit voice prototype</h1>
    <p>Compare the new voice connection with the existing Glint flow. Camera and image tools are not connected to this prototype yet.</p>
    <p>Joining sends microphone audio to LiveKit and the configured AI providers. Provider usage may incur charges. Transcripts below stay in this page; app recording is disabled.</p>
    {ready===false&&<p role="status">LiveKit is not configured. Follow docs/LIVEKIT_PROTOTYPE.md, then restart the app.</p>}
    {ready&&<><label>Prototype access code<input type="password" autoComplete="off" value={code} disabled={joining||connected} onChange={event=>setCode(event.target.value)}/></label>
      <button disabled={!csrf||!code||joining||connected} onClick={()=>void join()}>Join voice prototype</button></>}
    <p role="status">Connection: {state} · Agent: {agent}</p>
    {connected&&<button onClick={()=>void (async()=>{try{await room.current?.localParticipant.setMicrophoneEnabled(muted);setMuted(!muted);}catch{setProblem("Could not change microphone state.");}})()}>{muted?"Unmute microphone":"Mute microphone"}</button>}
    {connected&&<button onClick={()=>void room.current?.startAudio().then(()=>setProblem("")).catch(()=>setProblem("The browser could not enable audio. Check its playback permissions."))}>Enable speaker</button>}
    {csrf&&<button onClick={()=>void stop()}>End session</button>}
    {problem&&<p role="alert">{problem}</p>}
    <div role="log" aria-label="LiveKit conversation">{lines.map(line=><p key={line.id}><strong>{line.who}: </strong>{line.text}</p>)}</div>
    <div ref={audio}/>
  </main>;
}
