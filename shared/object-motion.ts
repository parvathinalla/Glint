import { z } from "zod";

export const trackInput = z.object({
  concept: z.string().trim().min(1).max(60),
  clip: z.string().max(800000),
  from: z.number().finite(), to: z.number().finite(),
  epoch: z.number().int().nonnegative(), requestId: z.string().uuid(),
});
export type TrackInput = z.infer<typeof trackInput>;
export type TrackBox = {
  objectId: string; frame: number; x1: number; y1: number; x2: number; y2: number;
  width: number; height: number; confidence?: number;
};
export type ObjectMotion = {
  concept: string; direction: "left" | "right" | "up" | "down" | "diagonal" | "back-and-forth" | "little-movement" | "uncertain";
  reason: string; boxes: TrackBox[]; reference: "camera-view";
  from: number; to: number; epoch: number;
};

/** Geometry evidence only; never assume identity across separate clips. */
export function summarizeMotion(boxes: TrackBox[]): Pick<ObjectMotion, "direction" | "reason" | "boxes" | "reference"> {
  const uncertain = (reason: string) => ({ direction: "uncertain" as const, reason, boxes: [], reference: "camera-view" as const });
  if (!boxes.length) return uncertain("No matching object was found in the recorded clip.");
  if (new Set(boxes.map(b => b.objectId)).size !== 1)
    return uncertain("Several matching objects or tracks were found; select a more specific object.");
  const ordered = [...boxes].sort((a,b) => a.frame-b.frame);
  if (ordered.length < 3 || new Set(ordered.map(b=>b.frame)).size !== ordered.length)
    return uncertain("Not enough distinct frames to establish movement.");
  const first=ordered[0], last=ordered.at(-1)!;
  if (ordered.some(b => ![b.frame,b.x1,b.y1,b.x2,b.y2,b.width,b.height].every(Number.isFinite) ||
      b.width<=0 || b.height<=0 || b.frame<0 || b.width!==first.width || b.height!==first.height ||
      b.x1<0 || b.y1<0 || b.x2>b.width || b.y2>b.height || b.x2<=b.x1 || b.y2<=b.y1 ||
      (b.confidence !== undefined && b.confidence < 0.5)))
    return uncertain("The object geometry or confidence is inconsistent.");
  // A gap may be an exit/occlusion: do not join identities across it.
  if (ordered.some((b,i)=>i>0 && b.frame-ordered[i-1].frame>1))
    return uncertain("The object was missing for part of the clip; identity continuity is uncertain.");
  const center=(b:TrackBox)=>[(b.x1+b.x2)/(2*b.width),(b.y1+b.y2)/(2*b.height)];
  const a=center(first), z=center(last), dx=z[0]-a[0], dy=z[1]-a[1];
  const centers=ordered.map(center);
  const spanX=Math.max(...centers.map(p=>p[0]))-Math.min(...centers.map(p=>p[0]));
  const spanY=Math.max(...centers.map(p=>p[1]))-Math.min(...centers.map(p=>p[1]));
  const threshold=0.04;
  const direction: ObjectMotion["direction"] = Math.hypot(dx,dy)<threshold
    ? Math.max(spanX,spanY)>threshold*2 ? "back-and-forth" : "little-movement"
    : Math.abs(dx)>Math.abs(dy)*1.5 ? dx>0 ? "right" : "left"
    : Math.abs(dy)>Math.abs(dx)*1.5 ? dy>0 ? "down" : "up" : "diagonal";
  return { direction, reason: "Measured in the recorded clip relative to the camera view. Camera movement can change apparent direction.", boxes: ordered, reference: "camera-view" };
}
