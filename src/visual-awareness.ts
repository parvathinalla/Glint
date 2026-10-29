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
) {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  const [status, setStatus] = useState<
    "off" | "loading" | "ready" | "unavailable"
  >("off");
  useEffect(() => {
    if (!active) {
      setStatus("off");
      return;
    }
    let live = true,
      ready = false,
      pending = false,
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
        !camera?.videoWidth ||
        camera.currentTime === lastTime
      )
        return;
      pending = true;
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
    }, 200);
    return () => {
      live = false;
      clearInterval(timer);
      worker.terminate();
    };
  }, [active, video]);
  return status;
}
