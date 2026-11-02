/**
 * The assistant's tasks and the exact shape each one returns. Shared by the
 * route handler (which asks Claude for this shape) and the panel (which
 * renders it), so both sides agree without a second type.
 */
import { z } from "zod";

export const AI_TASKS = [
  "plan",
  "perspective",
  "palette",
  "composition",
  "values",
  "traps",
  "explain",
  "lesson",
  "note",
] as const;
export type AiTask = (typeof AI_TASKS)[number];

/** A point in pixels of the image that was sent. */
const point = z.object({
  x: z.number().describe("Pixels from the left edge of the image"),
  y: z.number().describe("Pixels from the top edge of the image"),
});

/** A rectangle in pixels of the image that was sent. */
const rect = z.object({
  x: z.number().describe("Left edge in pixels"),
  y: z.number().describe("Top edge in pixels"),
  w: z.number().describe("Width in pixels"),
  h: z.number().describe("Height in pixels"),
});

export const PlanSchema = z.object({
  summary: z.string().describe("Two or three sentences on what this subject is about as a painting"),
  focalPoint: point.extend({ why: z.string() }),
  valueKey: z.enum(["high", "middle", "low"]).describe("Overall value key of the scene"),
  bigShapes: z
    .array(z.object({ label: z.string(), value: z.number().int().min(1).max(5).describe("1 = lightest, 5 = darkest") }))
    .describe("The four to six value shapes to block in first, lightest to darkest"),
  steps: z.array(z.string()).describe("Block-in order, each one short and concrete"),
  edges: z.array(z.object({ where: z.string(), treatment: z.enum(["sharp", "firm", "soft", "lost"]) })),
  mixes: z.array(z.object({ subject: z.string(), paints: z.array(z.string()), note: z.string() })),
});

export const PerspectiveSchema = z.object({
  type: z.enum(["one", "two", "three", "none"]).describe("Perspective type that best fits the scene"),
  horizonY: z.number().describe("Eye level in pixels from the top"),
  vanishingPoints: z.array(point.extend({ label: z.string() })).describe("May be outside the image bounds"),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().describe("One sentence on what the estimate was based on"),
});

export const PaletteSchema = z.object({
  summary: z.string(),
  limitedPalette: z.array(z.object({ name: z.string(), role: z.string() })).describe("Four to eight paints"),
  leaveOut: z.array(z.string()).describe("Paints from the user's list that this scene does not need"),
  temperature: z.string().describe("Where the warm and cool masses sit and how to keep them apart"),
});

export const CompositionSchema = z.object({
  options: z
    .array(
      z.object({
        ratio: z.string().describe("One of the ratio ids offered"),
        landscape: z.boolean(),
        rect: rect,
        title: z.string(),
        reason: z.string(),
      }),
    )
    .describe("Two or three crops"),
});

export const ValuesSchema = z.object({
  groups: z.number().int().describe("How many distinct value groups the design has"),
  readsAtThumbnail: z.boolean(),
  groupsDescribed: z.array(z.object({ label: z.string(), value: z.number().int().min(1).max(5) })),
  advice: z.string().describe("What to merge or separate so the design reads"),
});

export const TrapsSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      kind: z.string().describe("e.g. blown highlights, crushed shadows, lens distortion, colour cast, flat light"),
      where: rect,
      severity: z.enum(["minor", "notable", "serious"]),
      fix: z.string().describe("What to paint from knowledge instead of copying"),
    }),
  ),
});

export const ExplainSchema = z.object({
  answer: z.string().describe("A direct answer in plain language, a short paragraph"),
  related: z.array(point.extend({ label: z.string() })).describe("Up to three other spots worth comparing"),
});

export const LessonSchema = z.object({
  intro: z.string().describe("How the topic shows up in this particular photo"),
  examples: z.array(z.object({ where: rect, label: z.string(), explanation: z.string() })).describe("Two to four places"),
  exercise: z.string().describe("A ten-minute study to practise it"),
});

export const NoteSchema = z.object({
  title: z.string().describe("Five words or fewer"),
  note: z.string().describe("The session in two to four tidy sentences, keeping the painter's own observations"),
  nextTime: z.array(z.string()).describe("One to three things to try next session"),
});

export const SCHEMAS = {
  plan: PlanSchema,
  perspective: PerspectiveSchema,
  palette: PaletteSchema,
  composition: CompositionSchema,
  values: ValuesSchema,
  traps: TrapsSchema,
  explain: ExplainSchema,
  lesson: LessonSchema,
  note: NoteSchema,
} satisfies Record<AiTask, z.ZodType>;

export type AiResult<T extends AiTask> = z.infer<(typeof SCHEMAS)[T]>;

export interface AiImage {
  /** Base64 JPEG without the data-URL prefix. */
  data: string;
  width: number;
  height: number;
}

export interface AiRequest {
  task: AiTask;
  image?: AiImage;
  /** A second image for tasks that compare views, e.g. the 3-value map. */
  secondImage?: AiImage;
  context: {
    paints?: string[];
    dominantColors?: string[];
    ratios?: { id: string; label: string }[];
    point?: { x: number; y: number };
    question?: string;
    topic?: string;
    transcript?: string;
    imageName?: string;
  };
}

export type AiResponse =
  | { ok: true; task: AiTask; result: unknown; imageSize: { width: number; height: number } | null; usage: { input: number; output: number } }
  | { ok: false; error: string; code?: "no_key" | "refusal" | "offline" | "invalid" | "failed" };

export const LESSON_TOPICS = [
  "Atmospheric perspective",
  "Value grouping",
  "Edges: lost and found",
  "Warm and cool light",
  "Reflected light in shadows",
  "Linear perspective",
  "Counterchange",
  "Simplifying foliage",
  "Skies and cloud structure",
  "Painting water and reflections",
];
