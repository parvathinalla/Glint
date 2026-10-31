import { test, expect, type Page } from "./fixture";
import AxeBuilder from "@axe-core/playwright";
test.use({ reducedMotion:"reduce", viewport:{width:390,height:844} });
async function connected(page: Page) {
  await page.routeWebSocket("**/events", () => {});
  let session: Record<string,unknown>;
  await page.route("**/api/session", async route => {
    session = await (await route.fetch()).json();
    session.key = {connected:true,models:["muse-spark-test"]};
    await route.fulfill({json:session});
  });
  await page.route("**/api/phase", async route => {
    session.epoch=Number(session.epoch)+1;
    await route.fulfill({json:session});
  });
  await page.route("**/api/observe", route => route.fulfill({status:409,json:{message:"Fixture: observation paused"}}));
}
test("welcome has one start action and no demo or voice enrollment", async ({page}) => {
  await page.addInitScript(() => sessionStorage.removeItem("glint-started"));
  await page.goto("/");
  await expect(page.getByRole("button",{name:"Start Glint",exact:true})).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Try a demo|Teach Glint|Voice lock|illustrated example/)).toHaveCount(0);
  await page.getByRole("button",{name:"Start Glint",exact:true}).click();
  await expect(page.getByRole("button",{name:"Talk to Glint",exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/ui-home-light.png",fullPage:true});
});
test("themes persist and settings and conversation return to the same home", async ({page}) => {
  await connected(page); await page.goto("/");
  await page.getByRole("button",{name:"Open settings",exact:true}).click();
  await page.getByRole("button",{name:"Dark",exact:true}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await expect(page.getByText(/Voice lock|Teach Glint/)).toHaveCount(0);
  await page.screenshot({path:"test-results/ui-settings-dark.png",fullPage:true});
  await page.getByRole("button",{name:"Close settings"}).click();
  await page.getByRole("button",{name:"Open conversation"}).click();
  await expect(page.getByRole("dialog",{name:"Conversation",exact:true})).toBeVisible();
  expect((await page.locator(".glint-composer").boundingBox())!.width).toBeGreaterThan(300);
  await page.getByRole("button",{name:"Close conversation"}).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await expect(page.getByRole("button",{name:"Talk to Glint",exact:true})).toBeVisible();
});
test("instructions link opens and closes from settings", async ({page}) => {
  await connected(page); await page.goto("/");
  await page.getByRole("button",{name:"Open settings"}).click();
  await page.getByRole("button",{name:/Add instructions link/}).click();
  await expect(page.getByRole("dialog",{name:"Add instructions link"})).toBeVisible();
  await page.getByRole("button",{name:"Close dialog",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Add instructions link"})).not.toBeVisible();
});
test("desktop and conversation pass automated accessibility checks", async ({page}) => {
  await connected(page); await page.setViewportSize({width:1440,height:960}); await page.goto("/");
  await page.screenshot({path:"test-results/ui-home-desktop.png",fullPage:true});
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  await page.getByRole("button",{name:"Open conversation"}).click();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
test("camera opens with mic off, fullscreen returns, and end stops media", async ({page,context}) => {
  await context.grantPermissions(["camera","microphone"]);
  await connected(page); await page.goto("/");
  await page.getByRole("button",{name:"Open camera",exact:true}).click();
  await expect(page.getByText("Camera on · Mic off",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Talk to Glint",exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/ui-camera-phone.png",fullPage:true});
  await page.getByRole("button",{name:"View camera full screen"}).click();
  await expect(page.locator(".glint-camera")).toHaveClass(/is-fullscreen/);
  await page.getByRole("button",{name:"Exit full screen camera"}).click();
  await expect(page.locator(".glint-camera")).not.toHaveClass(/is-fullscreen/);
  await page.getByRole("button",{name:"End session",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Session ended."})).toBeVisible();
  await expect.poll(() => page.locator("video[aria-label='Your live camera preview']").count()).toBe(0);
  await page.getByRole("button",{name:"Start again",exact:true}).click();
  await expect(page.getByRole("button",{name:"Open camera",exact:true})).toBeVisible();
});
test("movement questions stay in chat and require readiness before any SAM call", async ({page,context}) => {
  await context.grantPermissions(["camera"]);
  await connected(page);
  let calls=0, llmCalls=0;
  await page.route("**/api/track", async route => {
    calls++; const body=route.request().postDataJSON();
    expect(Buffer.from(body.clip.split(',')[1],'base64').toString('ascii',4,8)).toBe('ftyp');
    await route.fulfill({json:{concept:body.concept,direction:"right",reason:"Recorded camera-relative movement.",boxes:[],reference:"camera-view",from:body.from,to:body.to,epoch:body.epoch}});
  });
  await page.route("**/api/agent/stream", route => {llmCalls++;return route.fulfill({status:500});});
  await page.goto("/");
  await page.getByRole("button",{name:"Open conversation"}).click();
  await page.getByRole("textbox",{name:"Message Glint"}).fill("Which way did I move the mouse?");
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect(page.getByText("Ready when you are.",{exact:true})).toBeVisible();
  expect(calls).toBe(0); expect(llmCalls).toBe(0);
  await page.getByRole("dialog",{name:"Conversation",exact:true}).getByRole("button",{name:"Open camera",exact:true}).first().click();
  await expect(page.getByRole("button",{name:"Ready — check movement",exact:true})).toBeVisible();
  expect(calls).toBe(0);
  const supported=await page.evaluate(() => typeof MediaRecorder!=="undefined" && MediaRecorder.isTypeSupported("video/mp4"));
  await page.getByRole("button",{name:"Ready — check movement",exact:true}).click();
  if (!supported) { await expect(page.getByRole("alert")).toContainText("MP4"); expect(calls).toBe(0); return; }
  await expect(page.getByRole("dialog",{name:"Conversation",exact:true}).getByText(/Recorded computer mouse: right/)).toBeVisible({timeout:15000});
  expect(calls).toBe(1);
  await page.getByRole("button",{name:"View clip",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Recorded movement",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Back to conversation",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Conversation",exact:true})).toBeVisible();
  await page.screenshot({path:"test-results/ui-tracking-conversation.png",fullPage:true});
});
