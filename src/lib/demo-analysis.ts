import type { AnalysisResult } from './analysis-types';
const emptyFacts = {
  request: null,
  location: null,
  date: null,
  quantity: null,
  budget: null,
};
const originals = {
  'sample-ava': {
    copyKey: 'ava',
    language: 'en',
    services: ['flight'],
    intent: 'availability',
    facts: {
      ...emptyFacts,
      request: {
        value: 'two return tickets',
        messageId: 'sample-msg-1',
        quote: 'two return tickets',
      },
      location: {
        value: 'Istanbul',
        messageId: 'sample-msg-1',
        quote: 'from Erbil to Istanbul',
      },
      date: { value: 'October 22–28', messageId: 'sample-msg-1', quote: 'October 22–28' },
      quantity: { value: 'two', messageId: 'sample-msg-1', quote: 'two return tickets' },
    },
  },
  'sample-rebaz': {
    copyKey: 'rebaz',
    language: 'ckb',
    services: ['visa'],
    intent: 'support',
    facts: {
      ...emptyFacts,
      location: { value: 'دوبەی', messageId: 'sample-msg-4', quote: 'ڤیزای گەشتیاری دوبەی' },
    },
  },
  'sample-noor': {
    copyKey: 'noor',
    language: 'en',
    services: [],
    intent: 'other',
    facts: { ...emptyFacts },
  },
  'sample-dilan': {
    copyKey: 'dilan',
    language: 'ckb',
    services: ['furniture', 'delivery'],
    intent: 'availability',
    facts: {
      ...emptyFacts,
      request: {
        value: 'قەنەفەی سێ کەسی',
        messageId: 'sample-msg-7',
        quote: 'قەنەفەی سێ کەسیتان هەیە؟',
      },
      location: {
        value: 'هەولێر',
        messageId: 'sample-msg-7',
        quote: 'گەیاندن بۆ هەولێر دەکەن؟',
      },
    },
  },
};

export const sampleAnalyses: Record<
  string,
  Omit<AnalysisResult, 'summary' | 'nextStep' | 'reviewNote'> & { copyKey: string }
> = Object.fromEntries(
  Object.entries(originals).map(([id, p]) => [
    id,
    {
      ...p,
      language: p.language as AnalysisResult['language'],
      inquiryStatus: 'new',
      stopOffers: null,
      subject: p.facts.request,
      facts: Object.entries(p.facts)
        .filter(([key, value]) => key !== 'request' && value)
        .map(([label, value]) => ({ label, ...value! })),
    },
  ]),
);
