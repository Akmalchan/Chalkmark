import { z } from "zod";

/**
 * A study sheet: what a good student would write down from the lecture — short, dense, printable on
 * one or two pages. Generated from the full notes; figures are referenced by block ID so the real
 * redrawn figures are reused instead of being described again.
 */
export const studySheetSchema = z.object({
  title: z.string(),
  subtitle: z.string().describe("Course and topic in a few words"),
  sections: z.array(z.object({
    heading: z.string().describe("2-5 words"),
    points: z.array(z.string()).describe("1-4 terse bullets in a student's own shorthand; $...$ for math; no filler"),
    formulas: z.array(z.object({
      latex: z.string().describe("KaTeX LaTeX without $ delimiters"),
      label: z.string().describe("A few words naming it, or empty"),
    })).describe("0-3 key formulas worth memorising"),
    example: z.object({
      kind: z.enum(["lecture", "practice"]).describe("lecture: worked in class; practice: a short example you made up because the lecture had none"),
      problem: z.string(),
      steps: z.array(z.string()).describe("2-4 short steps, $...$ for math"),
      answer: z.string(),
    }).nullable().describe("A worked example for this idea, or null"),
    figureId: z.string().nullable().describe("ID of one figure block that belongs here, or null"),
  })).describe("3-6 sections in teaching order"),
  takeaways: z.array(z.string()).describe("2-4 things to remember for the exam"),
});
export type StudySheet = z.infer<typeof studySheetSchema>;
