export const inquiryStatuses = ['new', 'inProgress', 'closed'] as const;
export type CustomerFields = {
  name: string;
  service: string;
  destination: string;
  inquiryStatus: (typeof inquiryStatuses)[number];
  note: string;
};
export type Conversation = CustomerFields & {
  consentStatus?: string | null;
  consentReplyStatus?: string | null;
  manualFields?: string[];
  categories?: string[];
  id: string;
  agencyId: string;
  connectionId: string;
  contactPhone: string;
  connectionLabel: string;
  displayPhone: string;
  lastInboundAt: string;
  lastMessageAt: string;
  preview: string | null;
};
export type InboxMessage = {
  id: string;
  body: string | null;
  type: string;
  direction: string;
  deliveryStatus: string;
  timestamp: string;
};
export function replyWindowOpen(lastInboundAt: string | Date, now = Date.now()) {
  const received = new Date(lastInboundAt).getTime();
  return Number.isFinite(received) && received <= now && now - received < 24 * 60 * 60 * 1000;
}
