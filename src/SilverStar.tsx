import { useEffect, useRef, useState, type ReactNode } from "react";
const starAnimation = "/avatars/glint-star-animation.mp4";

/** Use the supplied rendered animation; keep a fallback if video cannot play. */
export function SilverStar({ state, children }: { state: string; children: ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const node = video.current;
    if (!node) return;
    const surface = canvas.current;
    const ctx = surface?.getContext("2d", { willReadFrequently: true });
    if (!surface || !ctx) return;
    surface.width = 640; surface.height = 360;
    let frame = 0, last = -1000;
    const draw = () => {
      if (node.readyState < 2) return;
      ctx.drawImage(node, 0, 0, 640, 360);
      const pixels = ctx.getImageData(0, 0, 640, 360);
      const data = pixels.data;
      for (let y = 0; y < 360; y++) {
        const left = (y * 640 + 12) * 4, right = (y * 640 + 627) * 4;
        const background = [0, 1, 2].map(c => (data[left + c] + data[right + c]) / 2);
        for (let x = 0; x < 640; x++) {
          const i = (y * 640 + x) * 4;
          const difference = Math.max(data[i] - background[0], data[i+1] - background[1], data[i+2] - background[2]);
          const value = Math.max(0, Math.min(1, (difference - 65) / 65));
          const alpha = value * value * value * (value * (value * 6 - 15) + 10);
          data[i+3] = Math.round(alpha * 255);
          if (alpha > .01 && alpha < 1) {
            const edge = [185, 215, 235];
            for (let c = 0; c < 3; c++) data[i+c] = Math.round(data[i+c] * alpha + edge[c] * (1-alpha));
          }
        }
      }
      ctx.putImageData(pixels, 0, 0);
      setReady(true);
    };
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (!document.hidden && !node.paused && now-last >= 50) { last=now; draw(); }
    };
    frame = requestAnimationFrame(render);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (reduced.matches || document.hidden) {
        node.pause();
        if (reduced.matches && node.readyState >= 2) node.currentTime = .15;
      } else void node.play().catch(() => { /* A loaded still frame remains visible. */ });
    };
    const loaded = () => { draw(); update(); };
    node.addEventListener("seeked", draw);
    node.addEventListener("loadeddata", loaded);
    reduced.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    if (node.readyState >= 2) loaded(); else update();
    return () => {
      node.pause();
      cancelAnimationFrame(frame);
      node.removeEventListener("seeked", draw);
      node.removeEventListener("loadeddata", loaded);
      reduced.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return <span className={`spark silver-star spark-${state} ${ready ? "silver-star-ready" : ""}`} role="img" aria-label={`Glint animated star companion, ${state}`}>
    <span className="silver-star-fallback" aria-hidden="true">{children}</span>
    <canvas ref={canvas} className="silver-star-canvas star-transparent-animation" aria-hidden="true" />
    <video ref={video} src={starAnimation} muted loop playsInline preload="auto" aria-hidden="true" className="star-reference-video" onError={() => setReady(false)} />
  </span>;
}
