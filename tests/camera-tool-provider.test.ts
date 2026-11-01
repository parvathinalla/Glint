import {expect,it} from "vitest";
import {AgentProvider} from "../server/agent-provider";
const capabilities={camera:true,tracking:true,lastImage:false};
const edit={type:"function_call",status:"completed",call_id:"call-1",name:"edit_camera_image",arguments:JSON.stringify({prompt:"Fairy makeup",source:"camera"})};
function provider(output:unknown[],status="completed"){
 return new AgentProvider((async()=>Response.json({status,output})) as typeof fetch);
}
it("uses native function tools in the same model call and returns a validated action",async()=>{
 let body:Record<string,unknown>={};const agent=new AgentProvider((async(_url,init)=>{body=JSON.parse(String(init?.body));return Response.json({status:"completed",output:[edit]});}) as typeof fetch);
 const result=await agent.reply("TEST_ONLY_KEY","muse-spark-test",[],"Show fairy makeup on me",undefined,undefined,new AbortController().signal,undefined,undefined,capabilities);
 expect(body).toMatchObject({parallel_tool_calls:false,store:false});expect(body.tools).toEqual(expect.arrayContaining([expect.objectContaining({name:"edit_camera_image",strict:true})]));
 expect(result.action).toMatchObject({name:"edit_camera_image",args:{prompt:"Fairy makeup",source:"camera"}});expect(result.message).not.toContain("ready");
});
it("rejects unregistered, malformed, parallel, incomplete and unavailable tool calls",async()=>{
 for(const output of [[{...edit,name:"exec"}],[{...edit,arguments:"{"}],[edit,edit],[{...edit,status:"in_progress"}],[{...edit,name:"track_object_motion",arguments:'{"concept":"mouse"}'}],[{...edit,arguments:'{"prompt":"Fairy makeup","source":"last_result"}'}]]){
  await expect(provider(output).reply("TEST_ONLY_KEY","muse-spark-test",[],"Do it",undefined,undefined,new AbortController().signal,undefined,undefined,{...capabilities,tracking:false})).rejects.toMatchObject({code:"TOOL_INVALID"});
 }
 await expect(provider([edit],"incomplete").reply("TEST_ONLY_KEY","muse-spark-test",[],"Do it",undefined,undefined,new AbortController().signal,undefined,undefined,capabilities)).rejects.toMatchObject({code:"AGENT_INCOMPLETE"});
});
it("rejects annotation indexes without corresponding supplied evidence",async()=>{
 const annotation={...edit,name:"annotate_camera_frame",arguments:JSON.stringify({frameIndex:2,summary:"Visible port",confidence:"medium",marks:[]})};
 await expect(provider([annotation]).reply("TEST_ONLY_KEY","muse-spark-test",[],"Show the port",undefined,undefined,new AbortController().signal,undefined,[{image:"data:image/jpeg;base64,photo",capturedAt:Date.now()}],capabilities)).rejects.toMatchObject({code:"TOOL_INVALID"});
});
it("still answers ordinary questions without selecting a tool",async()=>{
 const result=await provider([{type:"message",content:[{type:"output_text",text:"Use the USB port."}]}]).reply("TEST_ONLY_KEY","muse-spark-test",[],"What is USB?",undefined,undefined,new AbortController().signal,undefined,undefined,capabilities);
 expect(result.message).toBe("Use the USB port.");expect(result.action).toBeUndefined();
});

it.each(["Is my image ready?","You created the image","Okay","Thank you","book","running."])("does not offer or execute camera tools for status or acknowledgment: %s",async question=>{
 let body:Record<string,unknown>={};
 const agent=new AgentProvider((async(_url,init)=>{body=JSON.parse(String(init?.body));return Response.json({status:"completed",output:[edit]});}) as typeof fetch);
 await expect(agent.reply("TEST_ONLY_KEY","muse-spark-test",[],question,undefined,undefined,new AbortController().signal,undefined,undefined,capabilities)).rejects.toMatchObject({code:"TOOL_INVALID"});
 expect(body.tools).toBeUndefined();
});

it("disables new tools for a conversation alongside an existing image",async()=>{
 let body:Record<string,unknown>={};const agent=new AgentProvider((async(_url,init)=>{body=JSON.parse(String(init?.body));return Response.json({status:"completed",output:[edit]});}) as typeof fetch);
 await expect(agent.reply("TEST_ONLY_KEY","muse-spark-test",[],"Create another image",undefined,undefined,new AbortController().signal,undefined,undefined,{...capabilities,imageInProgress:true})).rejects.toMatchObject({code:"TOOL_INVALID"});expect(body.tools).toBeUndefined();
});
