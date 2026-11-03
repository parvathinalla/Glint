export function runtimeConfig(env:NodeJS.ProcessEnv=process.env,args=process.argv){
  const production=args.includes("--production")||env.NODE_ENV==="production";
  const port=Number(env.PORT??3100);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error("PORT must be an integer between 1 and 65535.");
  const rawOrigin=env.APP_ORIGIN||env.RENDER_EXTERNAL_URL||`http://127.0.0.1:${port}`;
  let url:URL;try{url=new URL(rawOrigin);}catch{throw Error("APP_ORIGIN must be a valid origin.");}
  if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||!["http:","https:"].includes(url.protocol))throw Error("APP_ORIGIN must contain only an HTTP(S) origin.");
  if(production&&url.protocol!=="https:")throw Error("Production mode requires an HTTPS APP_ORIGIN or RENDER_EXTERNAL_URL.");
  if(production&&env.GLINT_TTS_PROVIDER==="livekit"){
    const missing=["LIVEKIT_API_KEY","LIVEKIT_API_SECRET","GLINT_LIVEKIT_TTS_MODEL","GLINT_LIVEKIT_TTS_VOICE"].filter(key=>!env[key]);
    if(missing.length)throw Error(`Missing cloud voice configuration: ${missing.join(", ")}`);
  }
  return {production,port,origin:url.origin,host:env.HOST||(production?"0.0.0.0":"127.0.0.1")};
}
