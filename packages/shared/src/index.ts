import { z } from 'zod';

export const CandidateNormalizedSchema = z.object({
  fullName: z.string(),
  headline: z.string().optional(),
  companyName: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  location: z.string().optional(),
  confidence: z.number().min(0).max(1)
});

export type CandidateNormalized = z.infer<typeof CandidateNormalizedSchema>;

export const MeddiccScorecardSchema = z.object({
  metrics: z.string().optional(),
  economicBuyer: z.string().optional(),
  decisionCriteria: z.string().optional(),
  decisionProcess: z.string().optional(),
  identifyPain: z.string().optional(),
  champion: z.string().optional(),
  competition: z.string().optional(),
  score: z.number().min(0).max(100)
});

export type MeddiccScorecard = z.infer<typeof MeddiccScorecardSchema>;
