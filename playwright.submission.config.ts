import {defineConfig} from "@playwright/test";
export default defineConfig({
  testDir:"./tests/submission",
  workers:1,
  use:{baseURL:"http://127.0.0.1:3118",browserName:"chromium",launchOptions:{args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]}},
  webServer:{command:"npm run dev:submission",url:"http://127.0.0.1:3118",reuseExistingServer:false,env:{PORT:"3118",APP_ORIGIN:"http://127.0.0.1:3118"}},
});
