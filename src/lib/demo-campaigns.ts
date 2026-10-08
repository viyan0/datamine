import type { CampaignView } from './campaign-types';
export const demoCampaigns: CampaignView[] = [
  {
    id: 'sample-offer',
    agencyId: 'demo-zagros',
    agencyName: 'Zagros Home',
    title: 'A better home office',
    offerText:
      '20% off home office desks and chairs this week. Delivery available in Erbil. Reply STOP to stop Datamine offers.',
    locale: 'en',
    status: 'ready',
    createdAt: '2026-10-08T09:00:00Z',
    error: null,
    template: {
      id: 'sample-template',
      name: 'home_office_offer',
      language: 'en',
      body: '20% off home office desks and chairs this week. Delivery available in Erbil. Reply STOP to stop Datamine offers.',
    },
    analysis: {
      summary: 'A home office furniture offer with delivery in Erbil.',
      categories: ['Office furniture', 'Delivery'],
    },
    recipients: [
      {
        id: 'sample-recipient',
        name: 'Sara Ahmed',
        phone: '+000 000 201',
        interests: ['furniture', 'delivery'],
        reason: 'Interested in home office furniture and delivery.',
        status: 'matched',
      },
    ],
  },
];
