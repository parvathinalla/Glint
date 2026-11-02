import {test,expect} from "@playwright/test";

test("the unconfigured prototype never starts legacy voice or captures media",async({page})=>{
  let media=0,legacy=0;
  await page.exposeFunction("mediaAttempt",()=>{media++;});
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{await (window as unknown as {mediaAttempt:()=>Promise<void>}).mediaAttempt();throw Error("Unexpected media capture");};});
  await page.route("**/api/session",route=>route.fulfill({json:{csrf:"test-csrf"}}));
  await page.route("**/api/livekit/config",route=>route.fulfill({json:{enabled:false}}));
  await page.route("**/api/livekit/session",route=>route.fulfill({json:{ended:true}}));
  await page.route("**/api/agent/stream",route=>{legacy++;return route.abort();});
  await page.routeWebSocket("**/voice-stream",()=>{legacy++;});
  await page.goto("/livekit");
  await expect(page.getByText(/LiveKit is not configured/)).toBeVisible();
  await expect(page.getByRole("button",{name:"Join voice prototype"})).toHaveCount(0);
  expect(media).toBe(0);expect(legacy).toBe(0);
});

test("an invalid access code shows the server error without starting the microphone",async({page})=>{
  let media=0,cleanup=0;
  await page.exposeFunction("mediaAttempt",()=>{media++;});
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{await (window as unknown as {mediaAttempt:()=>Promise<void>}).mediaAttempt();throw Error("Unexpected media capture");};});
  await page.route("**/api/session",route=>route.fulfill({json:{csrf:"test-csrf"}}));
  await page.route("**/api/livekit/config",route=>route.fulfill({json:{enabled:true}}));
  await page.route("**/api/livekit/session",route=>{cleanup++;return route.fulfill({json:{ended:true}});});
  await page.route("**/api/livekit/token",route=>{
    expect(route.request().headers()["x-glint-csrf"]).toBe("test-csrf");
    expect(route.request().postDataJSON()).toEqual({accessCode:"wrong-code"});
    return route.fulfill({status:403,json:{message:"The prototype access code was not accepted."}});
  });
  await page.goto("/livekit");await page.getByLabel("Prototype access code").fill("wrong-code");
  await page.getByRole("button",{name:"Join voice prototype"}).click();
  await expect(page.getByRole("alert")).toHaveText("The prototype access code was not accepted.");
  await expect(page.getByRole("button",{name:"Join voice prototype"})).toBeEnabled();
  expect(media).toBe(0);await expect.poll(()=>cleanup).toBe(1);
});

test("ending a pending join cannot enable microphone capture after its token arrives",async({page})=>{
  let requested=false,media=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.exposeFunction("mediaAttempt",()=>{media++;});
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{await (window as unknown as {mediaAttempt:()=>Promise<void>}).mediaAttempt();throw Error("Unexpected capture");};});
  await page.route("**/api/session",route=>route.fulfill({json:{csrf:"test-csrf"}}));
  await page.route("**/api/livekit/config",route=>route.fulfill({json:{enabled:true}}));
  await page.route("**/api/livekit/session",route=>route.fulfill({json:{ended:true}}));
  await page.route("**/api/livekit/token",async route=>{requested=true;await gate;await route.fulfill({json:{serverUrl:"wss://test.livekit.cloud",participantToken:"expired-test-token"}}).catch(()=>{});});
  await page.goto("/livekit");await page.getByLabel("Prototype access code").fill("test-only-code");
  await page.getByRole("button",{name:"Join voice prototype"}).click();await expect.poll(()=>requested).toBe(true);
  await page.getByRole("button",{name:"End session"}).click();release();
  await expect(page.getByRole("status")).toHaveText(/Connection: Disconnected/);
  await expect(page.getByRole("button",{name:"Join voice prototype"})).toBeEnabled();expect(media).toBe(0);
});

test("a joined room uses one audio element, supports microphone controls and disconnects cleanly",async({page})=>{
  await page.clock.install();
  const calls:boolean[]=[];let cleanups=0;
  await page.exposeFunction("microphoneToggle",(enabled:boolean)=>{calls.push(enabled);});
  await page.route("**/api/session",route=>route.fulfill({json:{csrf:"test-csrf"}}));
  await page.route("**/api/livekit/config",route=>route.fulfill({json:{enabled:true}}));
  await page.route("**/api/livekit/token",route=>route.fulfill({json:{serverUrl:"wss://test.livekit.cloud",participantToken:"TEST_ONLY_TOKEN"}}));
  await page.route("**/api/livekit/session",route=>{cleanups++;return route.fulfill({json:{ended:true}});});
  // Mock only SDK transport; exercise the real page's token, event and cleanup logic.
  await page.route("**/node_modules/.vite/deps/livekit-client.js*",route=>route.fulfill({contentType:"application/javascript",body:`
    export const RoomEvent={TrackSubscribed:'track',TrackUnsubscribed:'untrack',ConnectionStateChanged:'connection',ParticipantAttributesChanged:'attributes',TranscriptionReceived:'transcript',Disconnected:'disconnected'};
    export const Track={Kind:{Audio:'audio'}};
    export class Room {
      handlers={}; remoteParticipants=new Map(); localParticipant={identity:'tester',setMicrophoneEnabled:async value=>window.microphoneToggle(value)};
      on(name,handler){this.handlers[name]=handler;return this;}
      registerTextStreamHandler(_topic,callback){this.receive=callback;}
      async startAudio(){}
      async connect(){
        this.handlers.connection('connected');
        this.handlers.attributes({}, {attributes:{'lk.agent.state':'listening','glint.llm.provider':'baseten','glint.llm.model':'meta-models/muse-spark-open-1026','glint.stt.model':'deepgram/nova-3','glint.tts.model':'cartesia/sonic-3'}});
        this.handlers.track({kind:'audio',attach:()=>document.createElement('audio')});
        this.handlers.transcript?.([{id:'legacy-one',text:'Ready for your test.'}],{isLocal:false});
        for (const [streamId,text,final] of [['interim-a','Ready',false],['interim-b','Ready for your test.',false],['final','Ready for your test.',true]]) {
          await this.receive({info:{id:streamId,attributes:{'lk.segment_id':'turn-one','lk.transcription_final':String(final)}},async *[Symbol.asyncIterator](){yield text;}},{identity:'agent'});
        }
      }
      async disconnect(){await window.microphoneToggle(false);this.handlers.disconnected?.();}
    }
  `}));
  await page.goto("/livekit");await page.getByLabel("Prototype access code").fill("test-only-access");
  await page.getByRole("button",{name:"Join voice prototype"}).click();
  await expect(page.getByRole("button",{name:"Mute microphone"})).toBeVisible();
  await expect(page.getByText(/Conversation model: meta-models\/muse-spark-open-1026 via baseten/)).toBeVisible();
  await expect(page.getByRole("log")).toContainText("Ready for your test.");await expect(page.getByRole("log").locator("p")).toHaveCount(1);await expect(page.locator("audio")).toHaveCount(1);
  await expect(page.getByLabel("Prototype access code")).toHaveValue("");
  await page.getByRole("button",{name:"Mute microphone"}).click();await expect(page.getByRole("button",{name:"Unmute microphone"})).toBeVisible();
  await page.getByRole("button",{name:"Unmute microphone"}).click();
  await page.getByRole("button",{name:"End session"}).click();
  await expect(page.getByRole("status")).toContainText("Disconnected");await expect(page.locator("audio")).toHaveCount(0);
  expect(calls).toEqual([true,false,true,false]);expect(cleanups).toBe(1);
  await page.getByLabel("Prototype access code").fill("test-only-access");await page.getByRole("button",{name:"Join voice prototype"}).click();
  await expect(page.getByRole("button",{name:"Mute microphone"})).toBeVisible();
  await page.clock.fastForward(5*60000+1);
  await expect(page.getByRole("alert")).toHaveText("The five-minute test session finished. Join again to continue.");
  await expect(page.getByRole("status")).toContainText("Disconnected");expect(cleanups).toBe(2);
});
