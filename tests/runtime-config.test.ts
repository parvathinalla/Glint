import {expect,it} from "vitest";
import {runtimeConfig} from "../server/runtime-config";
it("keeps development local and binds cloud production to the provider port on all interfaces",()=>{
  expect(runtimeConfig({},[])).toEqual({production:false,host:"127.0.0.1",port:3100,origin:"http://127.0.0.1:3100"});
  expect(runtimeConfig({NODE_ENV:"production",PORT:"10000",RENDER_EXTERNAL_URL:"https://glint.onrender.com/"},[])).toEqual({production:true,host:"0.0.0.0",port:10000,origin:"https://glint.onrender.com"});
  expect(runtimeConfig({APP_ORIGIN:"https://glint.example",RENDER_EXTERNAL_URL:"https://other.onrender.com",HOST:"127.0.0.1"},["--production"]).origin).toBe("https://glint.example");
});
it("rejects invalid ports and production origins before starting a service",()=>{
  for(const PORT of ["0","65536","NaN","3100.5"])expect(()=>runtimeConfig({PORT},[])).toThrow("PORT");
  for(const APP_ORIGIN of ["http://glint.example","https://user:secret@glint.example","https://glint.example/path","https://glint.example/?secret=x","invalid"])
    expect(()=>runtimeConfig({APP_ORIGIN},["--production"])).toThrow();
  expect(()=>runtimeConfig({NODE_ENV:"production",RENDER_EXTERNAL_URL:"https://glint.onrender.com",GLINT_TTS_PROVIDER:"livekit"},[])).toThrow("Missing cloud voice configuration");
});
