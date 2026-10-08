export const analysisModel = 'claude-haiku-5-5';
export const analysisVersion = 1;
export const analysisIntents = [
  'price',
  'availability',
  'booking',
  'change',
  'cancellation',
  'support',
  'greeting',
  'other',
  'unclear',
] as const;
export const analysisLanguages = ['en', 'ar', 'ckb', 'mixed', 'other', 'unknown'] as const;
export const factNames = [
  'departure',
  'destination',
  'travelDates',
  'travelers',
  'budget',
] as const;
export type SourceMessage = { id: string; direction: string; body: string; timestamp: string };
export type TravelFact = { value: string; messageId: string; quote: string } | null;
export type AnalysisResult = {
  language: (typeof analysisLanguages)[number];
  services: ('other' | 'flight' | 'visa' | 'hotel' | 'package' | 'transfer')[];
  intent: (typeof analysisIntents)[number];
  summary: string;
  nextStep: string;
  reviewNote: string | null;
  facts: Record<(typeof factNames)[number], TravelFact>;
};
export type SavedAnalysis = {
  result: AnalysisResult;
  model: string;
  version: number;
  locale: string;
  createdAt: string;
  sourceHash: string;
  sourceMessageIds: string[];
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};
export type AnalysisState = { analysis: SavedAnalysis | null; stale: boolean; configured: boolean };
