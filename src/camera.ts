import { useCallback, useEffect, useRef, useState } from "react";
import { boundFrames } from "../shared/buffer.ts";
import type { VideoFrame } from "../shared/agent.ts";
export type Frame = { blob: Blob; at: number };
export function useCamera(onProblem: (s: string) => void) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const ring = useRef<Frame[]>([]);
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const interval = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const facing = useRef<"environment" | "user">("environment");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hint, setHint] = useState(
    "A steady, well-lit view helps me help you.",
  );
  const [buffer, setBuffer] = useState({ count: 0, bytes: 0 });
  const burstUntil = useRef(0),
    lastSample = useRef(0),
    encoding = useRef(false);
  const stop = useCallback(() => {
    generation.current++;
    if (interval.current) clearInterval(interval.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    worker.current?.terminate();
    worker.current = null;
    ring.current = [];
    encoding.current = false;
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setStarting(false);
    setBuffer({ count: 0, bytes: 0 });
  }, []);
  const sample = useCallback(async (): Promise<Frame | null> => {
    const v = video.current;
    if (!v || !v.videoWidth || !stream.current || encoding.current) return null;
    encoding.current = true;
    const epoch = generation.current;
    try {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = Math.round((640 * v.videoHeight) / v.videoWidth);
      if (c.height > 640) {
        c.height = 640;
        c.width = Math.round((640 * v.videoWidth) / v.videoHeight);
      }
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      const at = Date.now();
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((r) =>
        c.toBlob(r, "image/jpeg", 0.72),
      );
      if (!blob || epoch !== generation.current) return null;
      const f = { blob, at };
      ring.current.push(f);
      const bounded = boundFrames(ring.current, Date.now());
      setBuffer({ count: bounded.count, bytes: bounded.bytes });
      return f;
    } finally {
      encoding.current = false;
    }
  }, []);
  const start = useCallback(async () => {
    stop();
    const epoch = generation.current;
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 15, max: 24 },
          facingMode: { ideal: facing.current },
        },
        audio: false,
      });
      if (generation.current !== epoch) {
        media.getTracks().forEach((t) => t.stop());
        return false;
      }
      stream.current = media;
      const actualFacing = media.getVideoTracks()[0].getSettings?.().facingMode;
      if (actualFacing === "user" || actualFacing === "environment")
        facing.current = actualFacing;
      setFacingMode(facing.current);
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      if (generation.current !== epoch) {
        media.getTracks().forEach((t) => t.stop());
        return false;
      }
      const w = new Worker(new URL("./quality.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = (
        event: MessageEvent<{
          brightness: number;
          motion: number;
          edge: number;
        }>,
      ) => {
        const q = event.data;
        if (q.motion > 12) burstUntil.current = Date.now() + 2000;
        setHint(
          q.brightness < 45
            ? "A little more light would help."
            : q.motion > 28
              ? "The camera is moving. Hold it steady before checking."
              : q.edge < 3
                ? "The view may be soft. Bring the parts into focus."
                : "Good light. Keep the parts and your hands in view.",
        );
      };
      const small = document.createElement("canvas");
      small.width = 160;
      small.height = 90;
      interval.current = setInterval(() => {
        const v = video.current,
          ctx = small.getContext("2d", { willReadFrequently: true });
        if (!v?.videoWidth || !ctx) return;
        ctx.drawImage(v, 0, 0, 160, 90);
        const pixels = ctx.getImageData(0, 0, 160, 90).data;
        w.postMessage({ pixels, width: 160, height: 90 }, [pixels.buffer]);
        const rate = Date.now() < burstUntil.current ? 300 : 1000;
        if (Date.now() - lastSample.current >= rate) {
          lastSample.current = Date.now();
          void sample();
        }
      }, 250);
      media.getVideoTracks()[0].addEventListener("ended", () => {
        if (stream.current === media) {
          stop();
          onProblem("Camera access ended. Restart it when you are ready.");
        }
      });
      setActive(true);
      setStarting(false);
      return true;
    } catch {
      stop();
      onProblem(
        "Camera unavailable. Allow camera access in your browser, or use the labeled replay.",
      );
      return false;
    }
  }, [stop, sample, onProblem]);
  const flip = useCallback(async () => {
    facing.current = facing.current === "environment" ? "user" : "environment";
    return start();
  }, [start]);
  const recordClip = useCallback((signal: AbortSignal) => {
    const epoch=generation.current;
    if(!video.current || !stream.current)throw Error("Open the camera before tracking.");
    return recordTrackingClip(video.current,signal,()=>generation.current===epoch);
  },[]);
  const recent = useCallback(() => {
    const selected: Frame[] = [];
    for (const frame of [...ring.current].reverse()) {
      if (Date.now() - frame.at > 8000) continue;
      if (!selected.length || selected.at(-1)!.at - frame.at >= 800)
        selected.push(frame);
      if (selected.length === 6) break;
    }
    return selected.reverse();
  }, []);
  useEffect(() => () => stop(), [stop]);
  return { video, active, starting, start, stop, sample, recent, hint, buffer, flip, facingMode, recordClip };
}
/** A bounded, explicitly requested future clip, not continuous recording. */
export function recordTrackingClip(video: HTMLVideoElement,signal:AbortSignal,isCurrent=()=>true):Promise<{clip:string;from:number;to:number}> {
  if(typeof MediaRecorder==="undefined")return Promise.reject(Error("This browser cannot record a tracking clip."));
  const mime=["video/mp4;codecs=avc1.42E01E","video/mp4"].find(type=>MediaRecorder.isTypeSupported(type));
  if(!mime)return Promise.reject(Error("This browser cannot record the MP4 format required by SAM. Try another supported phone/browser."));
  if(!video.videoWidth || !video.videoHeight)return Promise.reject(Error("Wait for the camera preview before tracking."));
  const canvas=document.createElement("canvas"),scale=384/Math.max(video.videoWidth,video.videoHeight);
  canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
  const ctx=canvas.getContext("2d");
  if(!ctx)return Promise.reject(Error("Camera recording is unavailable."));
  const capture=canvas.captureStream(12);
  return new Promise((resolve,reject)=>{
    let recorder: MediaRecorder;
    try {recorder=new MediaRecorder(capture,{mimeType:mime,videoBitsPerSecond:300000});}
    catch {capture.getTracks().forEach(t=>t.stop());reject(Error("MP4 recording could not start."));return;}
    const chunks:Blob[]=[],from=Date.now();let bytes=0,settled=false;
    const cleanup=()=>{clearInterval(draw);clearTimeout(end);signal.removeEventListener("abort",abort);capture.getTracks().forEach(t=>t.stop());};
    const fail=(message:string)=>{if(settled)return;settled=true;cleanup();if(recorder.state!=="inactive")recorder.stop();reject(Error(message));};
    const abort=()=>fail("Tracking canceled.");
    const draw=setInterval(()=>{
      if(!isCurrent())return fail("Camera changed. Record a new tracking clip.");
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
    },1000/12);
    const end=setTimeout(()=>{if(recorder.state!=="inactive")recorder.stop();},2000);
    recorder.ondataavailable=event=>{
      if(settled)return;
      bytes+=event.data.size;
      if(bytes>600000)return fail("Tracking clip is too large. Try a steadier view.");
      chunks.push(event.data);
    };
    recorder.onerror=()=>fail("Camera clip recording failed.");
    recorder.onstop=()=>{
      if(settled)return;settled=true;cleanup();
      const to=Date.now();
      if(signal.aborted || !isCurrent()){reject(Error("Tracking canceled."));return;}
      void asDataUrl(new Blob(chunks,{type:"video/mp4"})).then(clip=>resolve({clip,from,to}),reject);
    };
    signal.addEventListener("abort",abort,{once:true});
    if(signal.aborted){abort();return;}
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    try {recorder.start(200);} catch {fail("MP4 recording could not start.");}
  });
}
export async function encodeCameraFrames(
  frames: Frame[],
): Promise<VideoFrame[]> {
  const encoded = await Promise.all(
    frames.map(async (frame) => {
      let blob = frame.blob;
      if (blob.size > 85000) {
        const image = await createImageBitmap(blob);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 384;
          canvas.height = Math.round((384 * image.height) / image.width);
          canvas
            .getContext("2d")
            ?.drawImage(image, 0, 0, canvas.width, canvas.height);
          const smaller = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.55),
          );
          if (smaller) blob = smaller;
        } finally {
          image.close();
        }
      }
      if (blob.size > 85000) return null;
      return { image: await asDataUrl(blob), capturedAt: frame.at };
    }),
  );
  return encoded.filter((frame): frame is VideoFrame => frame !== null);
}
export function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
