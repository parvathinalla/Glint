import { z } from "zod";

export const taskInput = z.object({
  title: z.string().trim().min(3).max(140),
  identity: z.string().trim().min(3).max(160),
  sourceTitle: z.string().trim().min(3).max(180),
  sourceUrl: z
    .string()
    .max(1000)
    .refine(
      (s) =>
        !s ||
        (() => {
          try {
            return new URL(s).protocol === "https:";
          } catch {
            return false;
          }
        })(),
      "Use an HTTPS source URL, or leave it empty.",
    ),
  sourceText: z.string().trim().min(30).max(16000),
  steps: z.array(z.string().trim().min(5).max(400)).min(2).max(12),
  remember: z.boolean(),
});
export type TaskInput = z.infer<typeof taskInput>;
export type Step = {
  id: string;
  text: string;
  prereqs: string[];
  status: "pending" | "user-reported";
  anchor: string;
};
export type Task = Omit<TaskInput, "steps"> & {
  id: string;
  revision: number;
  confirmed: boolean;
  sourceHash: string;
  kind: "demo" | "user";
  steps: Step[];
  createdAt: number;
};
export type Decision = {
  kind: "answer" | "uncertain" | "proposal";
  message: string;
  observations: string[];
  stepIds: string[];
};
export const decisionSchema = z.object({
  kind: z.enum(["answer", "uncertain", "proposal"]),
  message: z.string().min(1).max(1600),
  observations: z.array(z.string().max(300)).max(5),
  stepIds: z.array(z.string().max(30)).max(12),
});
export type View = {
  serverTime: number;
  csrf: string;
  task: Task | null;
  phase: "ready" | "active" | "paused";
  epoch: number;
  key: { connected: boolean; expiresAt?: number; models: string[] };
  calls: number;
  limit: number;
  busy: boolean;
  provider: string;
  capabilities: {
    image: "documented-not-live-tested";
    temporal: false;
    speechInput: "documented-not-live-tested";
    search: "documented-not-live-tested";
  };
};
export type Feedback = Decision & {
  mode: "replay" | "live";
  evidenceId: string;
  capturedAt: number;
  expiresAt: number;
  revision: number;
  epoch: number;
  tokens?: number;
};
export const demoInput: TaskInput = {
  title: "Build a little desk organizer",
  identity: "Glint example organizer · revision 1",
  sourceTitle: "Glint original example instructions",
  sourceUrl: "",
  sourceText:
    "Original demonstration instructions, not a manufacturer manual. Place the base on a flat surface. Slide the left and right panels into their matching slots in either order. Once both panels are fitted, insert the back divider gently. Check that the organizer sits level. Do not force a part that does not fit.",
  steps: [
    "Lay out the base and identify all three panels.",
    "Slide the left panel into the matching base slot.",
    "Slide the right panel into the matching base slot.",
    "Fit the back divider after both side panels are seated.",
    "Check that the organizer rests level without forcing parts.",
  ],
  remember: false,
};
export const canReport = (step: Step, task: Task) =>
  step.prereqs.every(
    (id) => task.steps.find((s) => s.id === id)?.status === "user-reported",
  );
