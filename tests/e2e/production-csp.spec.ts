import {test,expect} from "@playwright/test";
import {createServer,type Server} from "node:http";
import {once} from "node:events";
import {resolve} from "node:path";
import express from "express";
import {createApp} from "../../server/app";
import {Engine} from "../../server/engine";
import {Store} from "../../server/store";

let server:Server,engine:Engine,address:string;
test.use({reducedMotion:"reduce"});
test.beforeAll(async()=>{
  engine=new Engine(new Store(":memory:"),{models:async()=>[],infer:async()=>{throw Error("Provider dispatch is forbidden in this test");}});
  const app=createApp(engine,"https://glint.test",true);
  app.use(express.static(resolve("dist"),{index:false}));
  app.get("/{*path}",(_req,res)=>res.sendFile(resolve("dist/index.html")));
  server=createServer(app);server.listen(0,"127.0.0.1");await once(server,"listening");
  address=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
test.afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(done=>server.close(()=>done()));engine?.close();});

test("the built app and neural VAD load under production CSP without eval violations",async({page,context})=>{
  await context.grantPermissions(["microphone"]);
  await page.addInitScript(()=>{
    localStorage.setItem("glint-key-gate","1");sessionStorage.setItem("glint-started","1");
    localStorage.setItem("glint-streaming-voice","0");localStorage.setItem("glint-neural-voice","0");
    const events:string[]=[];(window as unknown as {policyViolations:string[]}).policyViolations=events;
    document.addEventListener("securitypolicyviolation",event=>events.push(event.effectiveDirective));
    const actual=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async constraints=>{
      if(!constraints?.audio||constraints.video)return actual(constraints);
      const audio=new AudioContext(),destination=audio.createMediaStreamDestination();await audio.resume();return destination.stream;
    };
  });
  await page.routeWebSocket("**/events",()=>{});
  await page.routeWebSocket("**/voice-stream",()=>{});
  await page.route("**/api/session",route=>route.fulfill({json:{csrf:"test-csrf",phase:"ready",epoch:0,calls:0,limit:100,tokens:0,key:{connected:true,models:["muse-spark-test"]},task:null}}));
  await page.route("**/api/diagnostics",route=>route.fulfill({json:{accepted:0}}));
  let providerDispatches=0;
  await page.route("**/api/voice",route=>{providerDispatches++;return route.abort();});
  await page.route("**/api/agent/stream",route=>{providerDispatches++;return route.abort();});
  const response=await page.goto(address);
  expect(response?.headers()["content-security-policy"]).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(response?.headers()["content-security-policy"]).not.toContain("'unsafe-eval'");
  const model=page.waitForResponse("**/vad/silero_vad.onnx");
  const wasm=page.waitForResponse(/\/vad\/runtime\/ort-wasm(?:-simd)?\.wasm/);
  await page.getByRole("button",{name:"Talk to Glint",exact:true}).click();
  await expect(page.getByRole("button",{name:"End voice chat",exact:true})).toBeVisible();
  expect((await model).ok()).toBe(true);expect((await wasm).ok()).toBe(true);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(()=>(window as unknown as {policyViolations:string[]}).policyViolations)).toEqual([]);
  await expect(page.getByText(/Neural voice detection unavailable/)).toHaveCount(0);
  expect(providerDispatches).toBe(0);
});
