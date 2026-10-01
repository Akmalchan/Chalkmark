import { z } from "zod";

const pointSchema = z.object({ x: z.number(), y: z.number() });
export const graphPanelSchema = z.object({
  title: z.string(),
  xLabel: z.string(),
  yLabel: z.string(),
  xMin: z.number(), xMax: z.number(), yMin: z.number(), yMax: z.number(),
  xTicks: z.array(z.object({ value: z.number(), label: z.string() })).describe("Use labeled source ticks when visible, e.g. π/2; empty for automatic ticks"),
  yTicks: z.array(z.object({ value: z.number(), label: z.string() })),
  series: z.array(z.object({
    label: z.string(),
    expression: z.string().nullable().describe("Known formula in explicit arithmetic, e.g. x^2, sin(x), 2*x+1. Supported: + - * / ^, parentheses, x, pi, e, sin cos tan exp log sqrt abs. No LaTeX or code. Null for an observed qualitative trace."),
    points: z.array(pointSchema).describe("Only for qualitative traces or data: observed points in drawing order. Empty when expression supplied."),
    style: z.enum(["solid", "dashed", "points"]),
  })).max(6),
  annotations: z.array(z.object({
    kind: z.enum(["line", "arrow", "polygon", "point", "label"]),
    points: z.array(pointSchema),
    label: z.string(),
    labelPosition: pointSchema.nullable(),
    dashed: z.boolean(),
  })).max(24).describe("Preserve visible tangent/secant lines, delta-x/delta-y triangles, points, arrows, and labels in plot coordinates; never invent their coordinates."),
});

export const lectureVisualSchema = z.object({
  kind: z.enum(["coordinate_graph", "concept_diagram", "table"]),
  title: z.string(),
  description: z.string().describe("One concise sentence explaining what the visual shows"),
  panels: z.array(graphPanelSchema).max(4).describe("One panel per separate source graph. Do not collapse a function and its derivative into one curve."),
  table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.string())) }).nullable(),
  sourceTimestampSeconds: z.number().nonnegative().nullable(),
  fidelity: z.enum(["formula_based", "qualitative", "uncertain"]),
  uncertainty: z.string().nullable().describe("State unreadable labels, approximate coordinates, or missing visual details. Null only if no specific uncertainty."),
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      x: z.number().describe("Horizontal position from 0 to 100"),
      y: z.number().describe("Vertical position from 0 to 100"),
    }),
  ).describe("Diagram nodes with positions from 0 to 100; empty for a coordinate graph"),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string().nullable(),
    }),
  ).describe("Connections between diagram node IDs; empty for a coordinate graph"),
});

export const lectureSchema = z.object({
  title: z.string().describe("Specific lecture title inferred from the content"),
  course: z.string().describe("Course or subject name, or 'Lecture' if unknown"),
  summary: z.string().describe("Two or three sentence overview of the lecture"),
  durationSeconds: z.number().nonnegative(),
  transcript: z.array(
    z.object({
      timestampSeconds: z.number().nonnegative(),
      speaker: z.string().describe("Speaker label such as Professor"),
      text: z.string(),
    }),
  ),
  sections: z.array(
    z.object({
      id: z.string(),
      startSeconds: z.number().nonnegative(),
      endSeconds: z.number().nonnegative(),
      title: z.string(),
      overview: z.string(),
      boardContent: z.array(z.string()).describe("Clean reconstruction of board content in reading order"),
      equations: z.array(
        z.object({
          latex: z.string().describe("Valid KaTeX-compatible LaTeX without delimiters"),
          meaning: z.string(),
        }),
      ),
      diagram: z.string().nullable().describe("Textual reconstruction of a diagram, or null"),
      visual: lectureVisualSchema.nullable().describe("A renderable graph or diagram when one is visibly used in the lecture, otherwise null"),
      spokenDetails: z.array(z.string()).describe("Important context said aloud but not written"),
      takeaways: z.array(z.string()),
      frameIds: z.array(z.string()).describe("IDs of provided board snapshots supporting this section"),
    }),
  ),
});

export type LectureDocument = z.infer<typeof lectureSchema> & {
  timelineStatus?: "in_range" | "unverified" | "invalid";
  durationVerified?: boolean;
  warnings?: string[];
};

export type BoardFrame = {
  id: string;
  timestampSeconds: number;
  score: number;
  dataUrl: string;
  width: number;
  height: number;
};
