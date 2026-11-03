import {spawn} from "node:child_process";
import {submissionEnvironment} from "../server/submission-policy.ts";

const command=process.argv[2];
if(!["dev","build","start"].includes(command))throw Error("Choose dev, build or start.");
const args=command==="start"?["start"]:["run",command];
// npm supplies its own CLI path; invoke it with Node to avoid shell quoting on Windows.
if(!process.env.npm_execpath)throw Error("Run through npm run dev:submission, build:submission or start:submission.");
const child=spawn(process.execPath,[process.env.npm_execpath,...args],{
  stdio:"inherit",env:submissionEnvironment(process.env),windowsHide:true,
});
child.on("error",error=>{console.error(error.message);process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code??1;});
