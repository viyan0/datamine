import type { AnalysisResult } from './analysis-types';
const emptyFacts = {
  departure: null,
  destination: null,
  travelDates: null,
  travelers: null,
  budget: null,
};
export const sampleAnalyses: Record<
  string,
  Omit<AnalysisResult, 'summary' | 'nextStep' | 'reviewNote'> & { copyKey: string }
> = {
  'sample-ava': {
    copyKey: 'ava',
    language: 'en',
    services: ['flight'],
    intent: 'availability',
    facts: {
      ...emptyFacts,
      departure: { value: 'Erbil', messageId: 'sample-msg-1', quote: 'from Erbil to Istanbul' },
      destination: {
        value: 'Istanbul',
        messageId: 'sample-msg-1',
        quote: 'from Erbil to Istanbul',
      },
      travelDates: { value: 'October 22–28', messageId: 'sample-msg-1', quote: 'October 22–28' },
      travelers: { value: 'two', messageId: 'sample-msg-1', quote: 'two return tickets' },
    },
  },
  'sample-rebaz': {
    copyKey: 'rebaz',
    language: 'ckb',
    services: ['visa'],
    intent: 'support',
    facts: {
      ...emptyFacts,
      destination: { value: 'دوبەی', messageId: 'sample-msg-4', quote: 'ڤیزای گەشتیاری دوبەی' },
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
    services: ['package'],
    intent: 'availability',
    facts: {
      ...emptyFacts,
      destination: {
        value: 'ئیستانبوڵ',
        messageId: 'sample-msg-7',
        quote: 'پاکێجی گەشت بۆ ئیستانبوڵ',
      },
    },
  },
};
