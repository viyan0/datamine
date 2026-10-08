export const analysisModel = 'claude-haiku-5-5';
export const analysisVersion = 3;
export const analysisLanguages = ['en', 'ar', 'ckb', 'mixed', 'other', 'unknown'] as const;
export type SourceMessage = { id: string; direction: string; body: string; timestamp: string };
export type CustomerFact = { value: string; messageId: string; quote: string } | null;
export type AnalysisResult = {
  language: (typeof analysisLanguages)[number];
  services: string[];
  intent: string;
  inquiryStatus: 'new' | 'inProgress' | 'closed';
  summary: string;
  nextStep: string;
  reviewNote: string | null;
  subject: CustomerFact;
  facts: { label: string; value: string; messageId: string; quote: string }[];
  stopOffers: CustomerFact;
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
export type AnalysisState = {
  analysis: SavedAnalysis | null;
  stale: boolean;
  configured: boolean;
  status: string;
  error: string | null;
};
