import type { Page } from "./fixture";
export async function openConversation(page: Page) {
  if (!(await page.getByRole("dialog",{name:"Conversation",exact:true}).isVisible()))
    await page.getByRole("button",{name:"Open conversation",exact:true}).click();
}
export async function closeConversation(page: Page) {
  if (await page.getByRole("dialog",{name:"Conversation",exact:true}).isVisible())
    await page.getByRole("button",{name:"Close conversation",exact:true}).click();
}
export async function openSettings(page: Page) {
  await closeConversation(page);
  if (await page.locator(".glint-camera.is-fullscreen").isVisible())
    await page.getByRole("button",{name:"Exit full screen camera",exact:true}).click();
  await page.getByRole("button",{name:"Open settings",exact:true}).click();
}
export async function setSpokenReplies(page: Page, enabled: boolean) {
  const restore=await page.getByRole("dialog",{name:"Conversation",exact:true}).isVisible();
  await openSettings(page);
  await page.getByRole("checkbox",{name:/Spoken replies/}).setChecked(enabled);
  await page.getByRole("button",{name:"Close settings",exact:true}).click();
  if (restore) await openConversation(page);
}
export async function typeMessage(page: Page, text: string) {
  await openConversation(page);
  await page.getByRole("textbox",{name:"Message Glint",exact:true}).fill(text);
}
export async function openInstructions(page: Page) {
  await openSettings(page);
  await page.getByRole("button",{name:/Add instructions link/}).click();
}
export async function openCameraFullscreen(page: Page) {
  await closeConversation(page);
  if (!(await page.getByRole("button",{name:"Stop camera",exact:true}).isVisible()))
    await page.getByRole("button",{name:"Open camera",exact:true}).click();
  if (!(await page.locator(".glint-camera.is-fullscreen").isVisible()))
    await page.getByRole("button",{name:"View camera full screen",exact:true}).click();
}
