import {useEffect,useRef,useState} from "react";
import type {Room} from "livekit-client";
import "./livekit-prototype.css";
import {updateLiveKitTranscript,type LiveKitLine} from "./livekit-transcripts";

/** Independent page: never starts the legacy mic, ASR, SpeechQueue, or VoicePlayer. */
export default function LiveKitPrototype(){
  const [ready,setReady]=useState<boolean|null>(null),[csrf,setCsrf]=useState("");
  const [code,setCode]=useState(""),[state,setState]=useState("Not connected"),[problem,setProblem]=useState("");
  const [joining,setJoining]=useState(false),[connected,setConnected]=useState(false),[muted,setMuted]=useState(false);
  const [agent,setAgent]=useState("Waiting for agent"),[lines,setLines]=useState<LiveKitLine[]>([]);
  const [models,setModels]=useState<{provider:string;llm:string;stt:string;tts:string}|null>(null);
  const room=useRef<Room|null>(null),attempt=useRef(0),controller=useRef<AbortController|null>(null),audio=useRef<HTMLDivElement>(null);
  const deadline=useRef<ReturnType<typeof setTimeout>|null>(null);
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
    return ()=>{cancel.abort();attempt.current++;controller.current?.abort();if(deadline.current)clearTimeout(deadline.current);void room.current?.disconnect();
      if(csrfRef.current)void fetch("/api/livekit/session",{method:"DELETE",headers:{"x-glint-csrf":csrfRef.current},keepalive:true}).catch(()=>{});};
  },[]);
  async function stop(){
    if(deadline.current){clearTimeout(deadline.current);deadline.current=null;}
    attempt.current++;controller.current?.abort();await room.current?.disconnect();room.current=null;
    audio.current?.replaceChildren();setConnected(false);setJoining(false);setMuted(false);setAgent("Waiting for agent");setState("Disconnected");
    try{await endCloud();}catch(error){setProblem((error as Error).message);}
  }
  async function join(){
    const version=++attempt.current;const abort=new AbortController();controller.current=abort;
    setProblem("");setJoining(true);setState("Connecting");setLines([]);setModels(null);
    try{
      const response=await fetch("/api/livekit/token",{method:"POST",headers:{"Content-Type":"application/json","x-glint-csrf":csrf},body:JSON.stringify({accessCode:code}),signal:abort.signal});
      const result=await response.json();if(!response.ok)throw Error(result.message||"Could not join LiveKit.");
      const {Room,RoomEvent,Track}=await import("livekit-client");if(version!==attempt.current)return;
      const next=new Room({adaptiveStream:true,dynacast:true});room.current=next;
      next.on(RoomEvent.TrackSubscribed,(track)=>{if(version!==attempt.current||track.kind!==Track.Kind.Audio)return;audio.current?.append(track.attach());});
      next.on(RoomEvent.TrackUnsubscribed,track=>track.detach().forEach(element=>element.remove()));
      next.on(RoomEvent.ConnectionStateChanged,value=>{if(version===attempt.current)setState(value);});
      const attributesChanged=(_changed:Record<string,string>,participant:{attributes:Record<string,string>})=>{
        if(version!==attempt.current)return;
        const attributes=participant.attributes;
        if(attributes["lk.agent.state"])setAgent(attributes["lk.agent.state"]);
        if(attributes["glint.llm.model"])setModels({provider:attributes["glint.llm.provider"]||"configured provider",llm:attributes["glint.llm.model"],stt:attributes["glint.stt.model"]||"configured STT",tts:attributes["glint.tts.model"]||"configured TTS"});
      };
      next.on(RoomEvent.ParticipantAttributesChanged,attributesChanged);
      next.on(RoomEvent.Disconnected,()=>{if(version===attempt.current){setConnected(false);setMuted(false);setAgent("Waiting for agent");setState("Disconnected");audio.current?.replaceChildren();}});
      next.on(RoomEvent.ParticipantDisconnected,participant=>{
        if(version===attempt.current&&participant.attributes["lk.agent.state"]){setProblem("The voice agent disconnected. Join a new test session to continue.");void stop();}
      });
      // Use one transport only. Stable segment IDs coalesce interim/final streams.
      let streamRevision=0;
      next.registerTextStreamHandler("lk.transcription",async(reader,info)=>{
        const participant=info.identity===next.localParticipant.identity?"You":"Glint";
        const attributes=reader.info.attributes??{},segment=attributes["lk.segment_id"]||reader.info.id;
        const id=`${info.identity}:${segment}`,revision=++streamRevision;
        let text="";
        try{
          for await(const chunk of reader){text+=chunk;if(version!==attempt.current)return;setLines(previous=>updateLiveKitTranscript(previous,{id,who:participant,text,final:false,revision}));}
          if(version===attempt.current)setLines(previous=>updateLiveKitTranscript(previous,{id,who:participant,text,final:attributes["lk.transcription_final"]!=="false",revision}));
        }catch{if(version===attempt.current)setProblem("A transcript update was interrupted. Audio may continue.");}
      });
      await next.connect(result.serverUrl,result.participantToken);if(version!==attempt.current){await next.disconnect();return;}
      next.remoteParticipants.forEach(participant=>attributesChanged({},participant));
      await next.startAudio().catch(()=>setProblem("Tap Enable speaker to allow audio playback."));
      await next.localParticipant.setMicrophoneEnabled(true);
      if(version!==attempt.current){await next.disconnect();return;}
      setConnected(true);setMuted(false);setCode("");setState("Connected");
      deadline.current=setTimeout(()=>{if(version!==attempt.current)return;setProblem("The five-minute test session finished. Join again to continue.");void stop();},5*60000);
    }catch(error){if(version===attempt.current){setProblem(error instanceof Error?error.message:"Connection failed.");await room.current?.disconnect();room.current=null;audio.current?.replaceChildren();setState("Disconnected");void endCloud().catch(()=>{});}}
    finally{if(version===attempt.current)setJoining(false);}
  }
  return <main className="livekit-prototype"><a href="/">← Return to Glint</a><h1>Glint LiveKit voice prototype</h1>
    <p>Compare the new voice connection with the existing Glint flow. Camera and image tools are not connected to this prototype yet. Each test session ends after five minutes; join again to continue.</p>
    <p>This is a separate Glint voice agent. It does not run the main Glint camera/image task engine.</p>
    {models&&<p>Conversation model: {models.llm} via {models.provider}. Speech recognition: {models.stt}. Voice: {models.tts}.</p>}
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
