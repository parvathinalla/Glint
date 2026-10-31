import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const out = resolve("docs/assets/glint-now-vs-production");
const esc = s => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
let art = '<rect width="2100" height="1930" fill="#f2f6fb"/>';
const text = (x, y, value, size = 23, color = "#34485f", bold = false) => {
  art += `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${bold ? 700 : 400}">${esc(value)}</text>`;
};
function card(x, y, title, lines, color) {
  art += `<rect x="${x}" y="${y}" width="950" height="157" rx="18" fill="white" stroke="#d7e1ec"/><rect x="${x}" y="${y+18}" width="6" height="121" rx="3" fill="${color}"/>`;
  text(x+24, y+37, title, 27, "#17324f", true);
  lines.forEach((line, i) => text(x+24, y+73+i*30, line, 22));
}
function arrow(x, y) {
  art += `<path d="M ${x} ${y} v 23" stroke="#8297af" stroke-width="3" marker-end="url(#head)"/>`;
}
text(60, 65, "GLINT", 43, "#176bd1", true);
text(235, 65, "Current pipeline → Production design", 40, "#17324f", true);
text(60, 108, "31 October 2026 • Brackets explain each tool • Right-hand side is a proposed target, not a deployed system", 23);
for (const [x, title, sub, c] of [[60,"TODAY — LOCAL APP","One computer runs the server; phone connects through a tunnel.","#2367c8"],[1090,"PRODUCTION — PROPOSED","A hosted service with reliable voice, user accounts and operations.","#087e80"]]) {
  art += `<rect x="${x}" y="145" width="950" height="94" rx="18" fill="${c}"/>`;
  text(x+24,183,title,28,"white",true);
  text(x+24,216,sub,21,"white");
}
const left = [
  ["1  Phone / browser", ["React [screen] + browser camera and microphone", "Silero [speech detection] • WeSpeaker [optional speaker check]", "MediaPipe [body-position cues] • front/back camera switch"]],
  ["2  Local server", ["Node.js + Express [handle requests on your computer]", "Cookie session [local user separation] • key stays in memory", "Cloudflare quick tunnel [temporary public link to your computer]"]],
  ["3  Understand speech and write the answer", ["Muse Voice Transcribe [live audio → recognized words]", "Final words + recent images + conversation → Muse Spark", "Muse Spark [understands context and streams answer text]"]],
  ["4  Generate spoken audio", ["Kokoro + sherpa-onnx [generate sentence audio on local CPU]", "Device voice [fallback; Telugu depends on available phone voice]", "Text can arrive well before audio; synthesis is a current bottleneck."]],
  ["5  Return to the user", ["SSE [web response streaming text and audio updates]", "Web Audio [plays sound] • visible transcripts and captions", "Microphone continues listening; local controls stop playback"]],
];
const right = [
  ["1  Phone / browser", ["Keep the same simple UI, local speech checks and camera controls.", "Immediate stop [does not wait for the network]", "Visible transcript, reconnect state and front/back camera switch"]],
  ["2  Secure hosted entry", ["Stable HTTPS domain + streaming-capable proxy [secure connection]", "Managed login [real user accounts] + session gateway [routing]", "One session owner; bounded buffers; provider calls stay server-side"]],
  ["3  Dedicated voice path", ["Live ASR [speech → words] → turn coordinator [one user turn]", "Fresh task context → Muse Spark [short, grounded streamed reply]", "Request IDs [reject old results] • voice does not wait for vision"]],
  ["4  Qualified streaming speech", ["Speech engine [choose by measured speed + language support]", "Generate small playable audio chunks; keep models warm.", "Isolated speech worker [old / canceled jobs cannot block new voice]"]],
  ["5  Deliver and verify playback", ["Stream audio + text immediately through the gateway.", "Browser reports first audio played [measure what the user hears].", "Explicit language / device fallback; test Telugu + English on phones."]],
];
for (let i=0;i<5;i++) {
  const y=266+i*193;
  card(60,y,...left[i],"#2367c8");
  card(1090,y,...right[i],"#087e80");
  if(i<4){arrow(535,y+163);arrow(1565,y+163);}
}
card(60,1247,"CAMERA PATH — runs beside conversation",[
  "Camera → up to 6 images from 8 seconds → Muse Spark → activity summary",
  "Idle checks about every 6 seconds; questions also use recent frames.",
  "No reliable persistent tracking of cups, tools or other task objects yet."
],"#2367c8");
card(1090,1247,"CAMERA PATH — separate background work",[
  "Useful frames → bounded vision worker [limited background processing]",
  "Fresh evidence + task state → context used by the voice path",
  "Optional SAM [object tracking] only after accuracy / cost / speed tests"
],"#087e80");
card(60,1427,"MEMORY AND LIMITS",[
  "Session history + visual summary [temporary app memory]",
  "SQLite [local file database]: optional progress, seven-day expiry",
  "100 provider dispatches [request allowance]; no dollar spending cap"
],"#2367c8");
card(1090,1427,"DATA AND OPERATIONS",[
  "PostgreSQL [durable task database] + per-user access checks",
  "Consent-based media retention; optional private storage if needed",
  "Spend controls, stage timings, alerts, deletion, load and device tests"
],"#087e80");
art += '<rect x="60" y="1612" width="1980" height="176" rx="18" fill="#e1eaf7"/>';
text(87,1651,"WHAT CHANGES FOR PRODUCTION?",27,"#17324f",true);
text(87,1691,"Keep the core: live speech → words + camera context → Spark → spoken reply.",26);
text(87,1729,"Replace the temporary tunnel and shared local speech bottleneck with hosted, measured and isolated services.",24);
text(87,1764,"Do not add every proposed tool at once: start with one gateway, a speech worker and a database; expand when measurements justify it.",22);
text(60,1831,"Reality check: production performance is a target to prove. A native speech-to-speech API is not used by the current Meta pipeline.",23);
text(60,1868,"Current timings in your logs: Spark text about 2–4 s; TTS generation / queue can take several seconds longer. These are examples, not benchmarks.",21);
text(60,1906,"Drawing: editable SVG + Node.js; PNG rendered by Playwright / Chromium. Current side reflects code; production side is an architectural recommendation.",20);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2100" height="1930" viewBox="0 0 2100 1930"><defs><marker id="head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#8297af"/></marker></defs><g font-family="Segoe UI, Arial, sans-serif">${art}</g></svg>`;
await writeFile(out+".svg",svg);
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:2100,height:1930},deviceScaleFactor:1.5});
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({path:out+".png",fullPage:true});
} finally { await browser.close(); }
console.log(out+".png");
