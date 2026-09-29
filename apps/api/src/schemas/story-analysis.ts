import { z } from "@hono/zod-openapi";

const paragraph = z.string().min(15).max(700);
export const AnalysisContentSchema = z.object({
  direction: z.enum(["tailwind", "headwind", "mixed", "neutral", "unclear"]),
  headline: z.string().min(10).max(160),
  whatHappened: paragraph,
  businessImpact: paragraph,
  bagImplication: paragraph,
  uncertainty: paragraph,
  watch: paragraph,
  evidence: z.string().min(16).max(700),
  affectedSymbols: z.array(z.string()).max(40),
}).strict();

export const StoryAnalysisSchema = AnalysisContentSchema.extend({
  version: z.literal(1), model: z.string(), analyzedAt: z.string(), thesis: z.string(),
  holdings: z.array(z.object({ symbol: z.string(), name: z.string(), weightBps: z.number().int().min(0).max(10000) })),
}).openapi("StoryAnalysis");
export const AnalysisUnavailableReasonSchema = z.enum(["not_analyzed", "missing_key", "insufficient_source", "provider_failure", "invalid_output"]);

export const CurationOutputSchema = z.object({
  summary: z.string().min(15).max(280),
  connections: z.array(z.object({
    bagId: z.string(), relationship: z.enum(["direct", "inferred"]), analysis: AnalysisContentSchema,
  }).strict()).min(1).max(40),
}).strict();
