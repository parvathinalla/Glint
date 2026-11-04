import { useEffect, useRef, useState, type RefObject } from "react";
import {
  VisualEventTracker,
  type Landmark,
  type VisualEvent,
} from "../shared/visual-events.ts";
/** Camera pixels for fast person/gesture reactions stay in this local worker. */
export function useVisualAwareness(
  video: RefObject<HTMLVideoElement | null>,
  active: boolean,
  onEvent: (event: VisualEvent) => void,
  onPose?: (points: Landmark[], at:number) => void,
  continuous = false,
) {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  const poseCallback=useRef(onPose),fast=useRef(continuous);
  poseCallback.current=onPose;fast.current=continuous;
  const [status, setStatus] = useState<
    "off" | "loading" | "ready" | "unavailable"
  >("off");
  useEffect(() => {
    if (!active || import.meta.env.VITE_GLINT_SUBMISSION_BUILD === "1") {
      setStatus("off");
      return;
    }
    let live = true,
      ready = false,
      pending = false,
      lastSent = -Infinity,
      lastTime = -1;
    setStatus("loading");
    const worker = new Worker("/vision-observer.js"),
      tracker = new VisualEventTracker();
    worker.onmessage = (event) => {
      if (!live) return;
      if (event.data.kind === "ready") {
        ready = true;
        setStatus("ready");
      }
      if (event.data.kind === "unavailable") {
        setStatus("unavailable");
      }
      if (event.data.kind === "pose") {
        pending = false;
        poseCallback.current?.(event.data.landmarks as Landmark[],event.data.at);
        for (const change of tracker.update(
          event.data.landmarks as Landmark[],
          event.data.at,
        ))
          callback.current(change);
      }
    };
    worker.onerror = () => {
      if (live) setStatus("unavailable");
    };
    worker.postMessage({ kind: "init" });
    const timer = setInterval(async () => {
      const camera = video.current;
      if (
        !live ||
        !ready ||
        pending ||
        document.hidden ||
        performance.now()-lastSent < (fast.current?100:200) ||
        !camera?.videoWidth ||
        camera.currentTime === lastTime
      )
        return;
      pending = true;
      lastSent=performance.now();
      lastTime = camera.currentTime;
      try {
        const bitmap = await createImageBitmap(camera, {
          resizeWidth: 384,
          resizeHeight: Math.round(
            (384 * camera.videoHeight) / camera.videoWidth,
          ),
        });
        if (!live) {
          bitmap.close();
          return;
        }
        worker.postMessage({ kind: "frame", bitmap, at: performance.now() }, [
          bitmap,
        ]);
      } catch {
        pending = false;
      }
    }, 100);
    return () => {
      live = false;
      clearInterval(timer);
      worker.terminate();
    };
  }, [active, video]);
  return status;
}
