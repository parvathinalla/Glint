import { z } from "zod";
import {cameraCapabilities,type CameraAction} from "./camera-tools";

export const publicLink = z
  .string()
  .max(2000)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname.includes(".") &&
      !/^[\d.]+$|:|(?:^|\.)(?:localhost|local|internal|test|example)$/.test(
        url.hostname,
      )
    );
  }, "Use a public HTTPS product or manual link.");
export const videoFrame = z.object({
  image: z.string().max(120000),
  capturedAt: z.number(),
});
export type VideoFrame = z.infer<typeof videoFrame>;
export const visualEvent = z.object({
  kind: z.enum(["person-entered", "hand-raised"]),
  at: z.number(),
});
export type CameraEvent = z.infer<typeof visualEvent>;
export const observationSchema = z.object({
  activity: z.string().max(400),
  scene: z.string().max(800),
  changes: z.array(z.string().max(200)).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  say: z.string().max(500).nullable(),
});
export type VisualObservation = z.infer<typeof observationSchema> & {
  capturedAt: number;
  from: number;
  epoch: number;
};
export const observeInput = z.object({
  frames: z.array(videoFrame).min(2).max(6),
  model: z.string().max(150),
  epoch: z.number().int().nonnegative(),
  requestId: z.string().uuid(),
  events: z.array(visualEvent).max(4).optional(),
});
export const agentInput = z
  .object({
    question: z.string().trim().min(1).max(2000),
    url: publicLink.optional(),
    model: z.string().max(150),
    epoch: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    image: z.string().max(850000).optional(),
    capturedAt: z.number().optional(),
    frames: z.array(videoFrame).min(1).max(6).optional(),
    events: z.array(visualEvent).max(4).optional(),
    voice: z.enum(["neural", "off"]).optional(),
    lookPreview: z.object({request:z.string().max(1500),stage:z.enum(["offered","photo-controls"])}).optional(),
    cameraTools:cameraCapabilities.optional(),
  })
  .refine(
    (input) => !(input.image && input.frames?.length),
    "Send either a camera sequence or one image.",
  );
export type AgentInput = z.infer<typeof agentInput>;
export type Turn = { role: "user" | "assistant"; content: string };
export type AgentReply = {
  message: string;
  sources: { title: string; url: string }[];
  searched: boolean;
  epoch: number;
  snapshot?: { capturedAt: number };
  action?:CameraAction;
};
