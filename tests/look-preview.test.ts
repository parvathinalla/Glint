import { afterEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ImageProvider } from "../server/image-provider";
import { Engine } from "../server/engine";
import { AgentProvider } from "../server/agent-provider";
import { SamProvider } from "../server/sam-provider";
import { Store } from "../server/store";
import { lookPreviewInput, wantsLookPreview,lookFollowup } from "../shared/look-preview";
const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=";
const engines:Engine[]=[];
afterEach(()=>engines.splice(0).forEach(engine=>engine.close()));
it("carries look choices into explicit image followups and keeps ambiguous no from dismissing",()=>{
  const start="Which Halloween look suits me?";
  const fantasy=lookFollowup("fantasy makeup",start)!;
  const fairy=lookFollowup("I want fairy.",fantasy.request)!;
  expect(fairy.kind).toBe("style");expect(fairy.request).toContain("fairy");
  for(const text of ["I don't have anything right now, just you create a image I will see if that looks good I will go and buy the stuff","can I choose a photo?","I want an image","Use the current camera view","yes"]){
    const result=lookFollowup(text,fairy.request)!;expect(result.kind).toBe("photo");expect(result.request).toContain("fairy");
  }
  expect(lookFollowup("No.",fairy.request)?.kind).toBe("clarify");
  expect(lookFollowup("Don't create an image",fairy.request)?.kind).toBe("dismiss");
  expect(lookFollowup("Cancel the preview",fairy.request)?.kind).toBe("dismiss");
  expect(lookFollowup("Which port is HDMI?",fairy.request)).toBeNull();
  expect(lookFollowup("Create a fairy makeup image",start)?.request).toContain("fairy makeup");
  expect(lookFollowup("create an image","")).toBeNull();
});
it("recognizes look requests without treating ordinary questions or refusals as consent",()=>{
  expect(wantsLookPreview("Which Halloween look suits me?")).toBe(true);
  expect(wantsLookPreview("Show a vampire costume on me")).toBe(true);
  expect(wantsLookPreview("Which look suits me?")).toBe(true);
  for(const text of ["Which side is the mouse?","How does the camera look?","How do I remove my makeup?","Just ideas for my Halloween outfit","Do not edit my photo"])
    expect(wantsLookPreview(text)).toBe(false);
  expect(lookPreviewInput.safeParse({photo:"x",prompt:"witch",consent:false,epoch:0,requestId:randomUUID()}).success).toBe(false);
});
it("edits through Muse Image without provider storage or extra tools",async()=>{
  let sent:Record<string,unknown>={};
  const provider=new ImageProvider((async(url,init)=>{
    expect(url).toBe("https://api.meta.ai/v1/responses");sent=JSON.parse(String(init?.body));
    return Response.json({status:"completed",output:[{type:"reasoning"},{type:"image_generation_call",status:"completed",result:png}],usage:{total_tokens:42}});
  }) as typeof fetch);
  const result=await provider.edit("TEST_ONLY_KEY","data:image/jpeg;base64,photo","A navy witch cape",new AbortController().signal);
  expect(sent).toMatchObject({model:"muse-image-1.0",store:false,tools:[{type:"image_generation",enable_web_search:false,enable_image_search:false,enable_shell:false}]});
  expect(JSON.stringify(sent.input)).toContain("Preserve the person's identity");
  expect(result).toEqual({image:`data:image/png;base64,${png}`,tokens:42});
});
it("rejects access failures, incomplete generations, invalid encodings and non-image output",async()=>{
  for(const response of [new Response("private error",{status:403}),Response.json({status:"incomplete",output:[]}),
    Response.json({status:"completed",output:[{type:"image_generation_call",status:"completed",result:btoa("<svg>not an image</svg>")}]}),
    Response.json({status:"completed",output:[{type:"image_generation_call",status:"completed",result:"!!!"}]})]){
    const provider=new ImageProvider((async()=>response) as typeof fetch);
    await expect(provider.edit("TEST_ONLY_KEY","photo","costume",new AbortController().signal)).rejects.toMatchObject({code:expect.stringMatching(/^IMAGE_/)});
  }
});
function setup(images:ImageProvider){
  const engine=new Engine(new Store(":memory:"),{models:async()=>["muse-spark-test"],infer:async()=>{throw Error("Unexpected text call");}},Date.now,new AgentProvider(),{},new SamProvider(),images);
  engines.push(engine);const {session}=engine.session();return {engine,session};
}
it("uses session auth, deduplication and quota without storing photo bytes in history",async()=>{
  let calls=0;
  const provider=new ImageProvider((async()=>{calls++;return Response.json({status:"completed",output:[{type:"image_generation_call",status:"completed",result:png}]});}) as typeof fetch);
  const {engine,session}=setup(provider);
  const input={photo:"data:image/jpeg;base64,reference",prompt:"Celestial witch",consent:true as const,epoch:session.epoch,requestId:randomUUID()};
  await expect(engine.previewLook(session,input)).rejects.toMatchObject({code:"KEY_REQUIRED"});
  expect(calls).toBe(0);await engine.connect(session,"TEST_ONLY_KEY");
  input.epoch=session.epoch;
  expect((await engine.previewLook(session,input)).image).toContain("data:image/png");
  expect(session.calls).toBe(1);expect(session.agentHistory).toEqual([]);
  await expect(engine.previewLook(session,input)).rejects.toMatchObject({code:"DUPLICATE"});
  session.calls=100;
  await expect(engine.previewLook(session,{...input,requestId:randomUUID()})).rejects.toMatchObject({code:"APP_LIMIT"});
  expect(calls).toBe(1);
});
it("discards a generation after the session is canceled",async()=>{
  let release!:()=>void;
  const provider=new ImageProvider((async()=>{await new Promise<void>(resolve=>{release=resolve;});return Response.json({status:"completed",output:[{type:"image_generation_call",status:"completed",result:png}]});}) as typeof fetch);
  const {engine,session}=setup(provider);await engine.connect(session,"TEST_ONLY_KEY");
  const pending=engine.previewLook(session,{photo:"reference",prompt:"witch",consent:true,epoch:session.epoch,requestId:randomUUID()});
  engine.phase(session,"paused");release();
  await expect(pending).rejects.toMatchObject({code:"CANCELED"});
});
it("gives Spark the current look context after older conversation history",async()=>{
  let body="";
  const agent=new AgentProvider((async(_url,init)=>{
    body=String(init?.body);return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"Choose your own photo in the preview."}]}]});
  }) as typeof fetch);
  const engine=new Engine(new Store(":memory:"),{models:async()=>["muse-spark-test"],infer:async()=>{throw Error("Unexpected dispatch");}},Date.now,agent);
  engines.push(engine);const {session}=engine.session();await engine.connect(session,"TEST_ONLY_KEY");
  session.agentHistory=[{role:"assistant",content:"Older conversation."}];
  await engine.converse(session,{question:"What do I do next?",model:"muse-spark-test",epoch:session.epoch,requestId:randomUUID(),lookPreview:{request:"Fairy makeup with a purple cape",stage:"photo-controls"}});
  expect(body).toContain("Never claim the app cannot create or edit images");
  expect(body).toContain("Fairy makeup with a purple cape");
  const input=JSON.stringify(JSON.parse(body).input);
  expect(input.indexOf("lookPreviewContext")).toBeGreaterThan(input.indexOf("Older conversation."));
});


it("keeps one image running while transcription and a follow-up answer complete",async()=>{
 let release!:()=>void,imageSignal!:AbortSignal;
 const imageGate=new Promise<void>(resolve=>{release=resolve;});
 const images=new ImageProvider((async(_url,init)=>{imageSignal=init!.signal as AbortSignal;await imageGate;return Response.json({status:"completed",output:[{type:"image_generation_call",status:"completed",result:png}]});}) as typeof fetch);
 const agent=new AgentProvider((async url=>String(url).endsWith("/asr/transcribe")?Response.json({transcript:"How do I wave?"}):Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"Move your hand side to side."}]}]})) as typeof fetch);
 const engine=new Engine(new Store(":memory:"),{models:async()=>["muse-spark-test"],infer:async()=>{throw Error("Unexpected dispatch");}},Date.now,agent,{},new SamProvider(),images);engines.push(engine);
 const session=engine.session().session;await engine.connect(session,"TEST_ONLY_KEY");
 const input={photo:"reference",prompt:"A greeting",consent:true as const,epoch:session.epoch,requestId:randomUUID()};
 const pending=engine.previewLook(session,input);
 await expect(engine.previewLook(session,{...input,requestId:randomUUID()})).rejects.toMatchObject({code:"BUSY"});
 expect((await engine.transcribe(session,new Uint8Array([1]),session.epoch,randomUUID())).transcript).toBe("How do I wave?");
 const reply=await engine.converse(session,{question:"How do I wave?",model:"muse-spark-test",epoch:session.epoch,requestId:randomUUID(),cameraTools:{camera:true,tracking:false,lastImage:false,imageInProgress:true}});
 expect(reply.message).toBe("Move your hand side to side.");expect(imageSignal.aborted).toBe(false);expect(engine.view(session).busy).toBe(true);
 release();await expect(pending).resolves.toHaveProperty("image");expect(session.calls).toBe(3);expect(engine.view(session).busy).toBe(false);
});
it("canceling a follow-up request does not cancel the independent image",async()=>{
 let imageRelease!:()=>void,textRelease!:()=>void;
 const images=new ImageProvider((async()=>{await new Promise<void>(resolve=>{imageRelease=resolve;});return Response.json({status:"completed",output:[{type:"image_generation_call",status:"completed",result:png}]});}) as typeof fetch);
 const agent=new AgentProvider((async()=>{await new Promise<void>(resolve=>{textRelease=resolve;});return Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"Reply"}]}]});}) as typeof fetch);
 const engine=new Engine(new Store(":memory:"),{models:async()=>["muse-spark-test"],infer:async()=>{throw Error("Unexpected dispatch");}},Date.now,agent,{},new SamProvider(),images);engines.push(engine);
 const session=engine.session().session;await engine.connect(session,"TEST_ONLY_KEY");const epoch=session.epoch;
 const image=engine.previewLook(session,{photo:"reference",prompt:"Greeting",consent:true,epoch,requestId:randomUUID()});
 const requestId=randomUUID(),answer=engine.converse(session,{question:"Explain waving",model:"muse-spark-test",epoch,requestId,cameraTools:{camera:true,tracking:false,lastImage:false,imageInProgress:true}});
 await expect(engine.transcribe(session,new Uint8Array([1]),epoch,randomUUID())).rejects.toMatchObject({code:"BUSY"});
 engine.cancelConversationRequest(session,requestId);expect(session.imageController?.signal.aborted).toBe(false);expect(session.epoch).toBe(epoch);
 textRelease();await expect(answer).rejects.toMatchObject({code:"CANCELED"});imageRelease();await expect(image).resolves.toHaveProperty("image");
});
