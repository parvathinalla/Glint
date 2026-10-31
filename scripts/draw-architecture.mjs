import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

// Deterministic, editable architecture image. No running app or provider calls.
const out = resolve('docs/assets/glint-current-architecture');
const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
let shapes = '';
function text(x,y,s,size=21,color='#31445d',weight=400) {
  shapes += `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(s)}</text>`;
}
function box(x,y,w,h,title,tool,lines,color='#2367c8') {
  shapes += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="white" stroke="#d6e1ee"/><rect x="${x}" y="${y+16}" width="5" height="${h-32}" rx="2" fill="${color}"/>`;
  text(x+22,y+34,title,24,'#132b49',700);
  text(x+22,y+64,tool,19,color,600);
  lines.forEach((s,i)=>text(x+22,y+96+i*28,s,19));
}
function arrow(x1,y1,x2,y2,color='#67809e') {
  shapes += `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${color}" stroke-width="3" fill="none" marker-end="url(#arrow)"/>`;
}
shapes += '<rect width="1800" height="1510" fill="#f2f6fb"/>';
text(60,67,'GLINT',40,'#1467ca',800);
text(225,67,'How the companion works',38,'#132b49',700);
text(60,108,'Current local implementation • Source review: 31 October 2026 • Tools are listed beside each job',21);
const cols = [[60,'1  YOUR BROWSER','#2367c8'],[650,'2  LOCAL APP SERVER','#087e80'],[1240,'3  EXTERNAL AI SERVICE','#7e4ab9']];
for (const [x,label,c] of cols) {
  shapes += `<rect x="${x}" y="145" width="500" height="47" rx="12" fill="${c}"/>`;
  text(x+20,177,label,22,'white',700);
}
box(60,215,500,155,'Companion screen','React 19 + TypeScript + CSS / SVG',[
  'Chat, transcripts, front/back camera controls',
  'Animated star intro; illustrated task example']);
box(60,390,500,215,'See the task','Browser camera + Canvas + Web Workers',[
  'Quality checks and bounded frame buffer',
  'MediaPipe Pose Landmarker: local pose events',
  'Up to 6 recent frames sent per observation',
  'Idle observations about every 6 seconds']);
box(60,625,500,215,'Hear the user','Web Audio / AudioWorklet + ONNX WASM',[
  'Silero VAD + energy: detect speech turns',
  'WeSpeaker: optional enrolled-speaker check',
  'Echo guard and interruption handling',
  'PCM streaming; bounded WAV fallback']);
box(60,860,500,155,'Show and speak the reply','Stream reader + Web Audio + Speech API',[
  'Incremental text, captions and PCM playback',
  'Device speech if neural voice is unavailable']);
box(650,215,500,155,'Accept and validate requests','Node.js 24 + Express 5 + Helmet + Zod',[
  'Private cookie session and origin checks',
  'HTTP API, status socket and voice socket'],'#087e80');
box(650,390,500,215,'Coordinate the conversation','Engine + shared TypeScript schemas',[
  'Chat history, visual context and task steps',
  'Memory-only provider key with expiry',
  'Cancellation, freshness and dispatch limits',
  'Provider adapters select the right AI route'],'#087e80');
box(650,625,500,215,'Relay speech and synthesize replies','ws gateway + local sherpa-onnx-node',[
  'Forward microphone PCM to Meta ASR',
  'Kokoro af_heart: local CPU voice',
  'Device voice fallback; Telugu if available',
  'Stream synthesized sentence PCM to browser'],'#087e80');
box(650,860,500,155,'Remember progress only if requested','SQLite via node:sqlite',[
  '.data/glint.sqlite • seven-day expiry',
  'No API keys, conversation or image bytes'],'#087e80');
box(1240,215,500,155,'Connect the selected model','Meta API • api.meta.ai/v1',[
  'User supplies a session-only API key (BYOK)',
  'Model list: /models'],'#7e4ab9');
box(1240,390,500,215,'Understand, answer and research','Muse Spark • Responses API',[
  'Text + ordered camera frames + context',
  'Streams answer text for conversation',
  'Built-in web_search for a supplied URL',
  'Checkpoint adapter: /chat/completions'],'#7e4ab9');
box(1240,625,500,215,'Convert speech into words','Muse Voice Transcribe',[
  'Live ASR over /asr/realtime WebSocket',
  'Partial and final transcript events',
  'Bounded WAV transcription fallback',
  'Transcript feeds the conversation route'],'#7e4ab9');
box(1240,860,500,155,'What crosses this boundary','Provider calls use the connected user key',[
  'Selected images, speech and text leave device',
  'Pose / VAD / speaker inference stay local'],'#7e4ab9');
arrow(565,475,640,475); arrow(1155,475,1230,475);
arrow(565,720,640,720); arrow(1155,720,1230,720);
text(578,455,'API',16); text(1167,455,'HTTPS',16);
text(571,700,'socket',16); text(1163,700,'socket',16);
shapes += '<rect x="60" y="1045" width="1680" height="172" rx="18" fill="#e3edf9"/>';
text(85,1081,'FOLLOW ONE VOICE TURN',23,'#132b49',700);
text(85,1120,'You speak → local speech detector → server → Meta transcription → transcript + recent camera frames → Muse Spark',22);
text(85,1156,'Muse reply → local Kokoro / device voice → streamed text + audio → browser captions and speaker',22);
text(85,1191,'Transport: HTTP JSON for controls • /voice-stream for microphone PCM • SSE response for reply text and audio • /events for status',19);
box(60,1240,815,155,'Build and verify','npm + Vite + tsx + TypeScript + ESLint',[
  'Vitest: unit / integration • Playwright: browser tests',
  'axe-core: accessibility checks • fixtures simulate providers']);
box(895,1240,845,155,'Scope of this picture','Implemented local prototype; live qualification remains pending',[
  'Managed auth, PostgreSQL and cloud hosting are future work.',
  'No native speech-to-speech or continuous full-FPS cloud video.'],'#95602a');
text(60,1443,'Drawing tools: SVG + Node.js; PNG rendered with Playwright / Chromium. Editable source is included.',20);
text(60,1478,'Code is the reference: older design documents and README contain proposed or outdated details.',19);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1510" viewBox="0 0 1800 1510"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" fill="#67809e"/></marker></defs><g font-family="Segoe UI, Arial, sans-serif">${shapes}</g></svg>`;
await writeFile(out+'.svg', svg);
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1800,height:1510},deviceScaleFactor:1.5});
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({path:out+'.png',fullPage:true});
} finally { await browser.close(); }
console.log(out+'.png');
