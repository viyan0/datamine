export type CampaignView = {
  id: string;
  agencyId: string;
  agencyName: string;
  title: string;
  offerText: string;
  locale: string;
  status: string;
  networkEnabled?: boolean;
  networkExpiresAt?: string | null;
  deliveryMode?: 'template' | 'reply';
  replySenderLabel?: string;
  createdAt: string;
  error: string | null;
  template: { id: string; name: string; language: string; body: string } | null;
  analysis: { summary: string; categories: string[] } | null;
  recipients?: {
    id: string;
    name: string;
    phone: string;
    interests: string[];
    reason: string;
    status: string;
    replyWindowExpiresAt?: string | null;
  }[];
};
