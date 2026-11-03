import { Problem } from "./provider.ts";

const MAX_RESPONSE = 12000000;
export class ImageProvider {
  constructor(private fetcher: typeof fetch = fetch) {}
  async edit(key: string, photo: string, prompt: string, signal: AbortSignal) {
    const response = await this.fetcher("https://api.meta.ai/v1/responses", {
      method: "POST", signal,
      headers: {Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      body: JSON.stringify({model:"muse-image-1.0",store:false,
        tools:[{type:"image_generation",enable_web_search:false,enable_image_search:false,enable_shell:false,reasoning_strength:"low",output_format:"webp"}],
        input:[{role:"user",content:[
          {type:"input_text",text:"Create one creative outfit/makeup preview by editing the supplied photo. Preserve the person's identity, face, skin tone, body proportions and age. Change only the requested outfit, makeup, accessories or setting. This is an illustrative preview, not an attractiveness rating or personality assessment. User's requested edit: "+prompt},
          {type:"input_image",image_url:photo},
        ]}],
      }),
    });
    if(!response.ok) throw new Problem(response.status===401||response.status===403?403:response.status===429||response.status===402?429:502,
      "IMAGE_ACCESS",response.status===401||response.status===403?"Muse Image access was not accepted. Check that your connected key has image-model access.":"Muse Image could not create this preview. Check credits or try again later. No automatic retry was made.");
    const reader=response.body?.getReader();
    if(!reader) throw new Problem(502,"IMAGE_RESPONSE","Muse Image returned no preview.");
    const chunks:Uint8Array[]=[];let size=0;
    try {
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
        if(size>MAX_RESPONSE) {await reader.cancel();throw Error("Too large");} chunks.push(value);}
      const body=JSON.parse(Buffer.concat(chunks).toString("utf8")) as {status?:string;output?:Array<{type?:string;status?:string;result?:unknown}>;usage?:{total_tokens?:number}};
      const image=body.output?.find(item=>item.type==="image_generation_call");
      if(body.status!=="completed" || image?.status!=="completed" || typeof image.result!=="string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.result)) throw Error("Incomplete");
      const bytes=Buffer.from(image.result,"base64");
      const mime=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":
        bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217?"image/jpeg":
        bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP"?"image/webp":null;
      if(!mime||bytes.length<20||bytes.length>8000000) throw Error("Invalid image");
      return {image:`data:${mime};base64,${image.result}`,tokens:Math.max(0,Math.min(1000000,Number(body.usage?.total_tokens)||0))};
    } catch(error) {
      if(signal.aborted) throw error;
      throw new Problem(502,"IMAGE_RESPONSE","Muse Image did not return a complete supported image. No automatic retry was made.");
    } finally {reader.releaseLock();}
  }
}
