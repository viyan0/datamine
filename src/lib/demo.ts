import type { WorkspaceData } from './workspace';
import { activityDays, dashboardDate, type DailyActivity } from './dashboard-analytics';
import { demoConversations, demoMessages } from './demo-inbox';

const sampleMessages = Object.values(demoMessages).flat();
const sampleDays = new Map<string, DailyActivity>();
for (const message of sampleMessages) {
  const date = dashboardDate(new Date(message.timestamp));
  const day = sampleDays.get(date) ?? { date, received: 0, sent: 0 };
  if (message.direction === 'inbound') day.received++;
  else if (['sent', 'delivered', 'read'].includes(message.deliveryStatus)) day.sent++;
  sampleDays.set(date, day);
}
const latestSample = new Date(
  Math.max(...sampleMessages.map((message) => new Date(message.timestamp).getTime())),
);

export const demoData: WorkspaceData = {
  user: { name: 'Demo explorer', email: 'explorer@example.com', platformAdmin: false },
  agencies: [
    {
      id: 'demo-atlas',
      name: 'Atlas Travel',
      industry: 'Travel',
      categories: ['flight', 'visa', 'hotel', 'package', 'other'],
      slug: 'atlas-travel',
      locale: 'en',
      role: 'owner',
      createdAt: '2026-10-01T08:00:00Z',
    },
    {
      id: 'demo-zagros',
      name: 'Zagros Home',
      industry: 'Home furnishings',
      categories: ['furniture', 'delivery', 'support', 'other'],
      slug: 'zagros-home',
      locale: 'ckb',
      role: 'admin',
      createdAt: '2026-10-02T08:00:00Z',
    },
    {
      id: 'demo-horizon',
      name: 'Horizon Salon',
      industry: 'Hair and beauty salon',
      categories: ['haircut', 'color', 'booking', 'other'],
      slug: 'horizon-salon',
      locale: 'ar',
      role: 'owner',
      createdAt: '2026-10-03T08:00:00Z',
    },
  ],
  connections: [
    {
      id: 'demo-number-1',
      agencyId: 'demo-atlas',
      agencyName: 'Atlas Travel',
      label: 'Atlas main line',
      displayPhone: '+000 000 001',
      phoneNumberId: 'sample-001',
      status: 'receiving',
      lastWebhookAt: '2026-10-08T08:00:00Z',
    },
    {
      id: 'demo-number-2',
      agencyId: 'demo-zagros',
      agencyName: 'Zagros Home',
      label: 'Zagros main line',
      displayPhone: '+000 000 002',
      phoneNumberId: 'sample-002',
      status: 'configured',
      lastWebhookAt: null,
    },
  ],
  members: [
    {
      id: 'demo-person-1',
      agencyId: 'demo-atlas',
      agencyName: 'Atlas Travel',
      name: 'Sara Ahmed',
      email: 'sara@example.com',
      role: 'owner',
    },
    {
      id: 'demo-person-2',
      agencyId: 'demo-atlas',
      agencyName: 'Atlas Travel',
      name: 'Omar Ali',
      email: 'omar@example.com',
      role: 'agent',
    },
    {
      id: 'demo-person-3',
      agencyId: 'demo-zagros',
      agencyName: 'Zagros Home',
      name: 'Dilan Azad',
      email: 'dilan@example.com',
      role: 'admin',
    },
    {
      id: 'demo-person-4',
      agencyId: 'demo-horizon',
      agencyName: 'Horizon Salon',
      name: 'Noor Hassan',
      email: 'noor@example.com',
      role: 'owner',
    },
  ],
  activity: [
    {
      id: 'demo-event-1',
      action: 'connectionAdded',
      agencyName: 'Atlas Travel',
      createdAt: '2026-10-08T08:00:00Z',
    },
    {
      id: 'demo-event-2',
      action: 'memberJoined',
      agencyName: 'Zagros Home',
      createdAt: '2026-10-07T11:00:00Z',
    },
    {
      id: 'demo-event-3',
      action: 'agencyCreated',
      agencyName: 'Horizon Salon',
      createdAt: '2026-10-06T09:00:00Z',
    },
  ],
  messageCount: sampleMessages.filter((message) => message.direction === 'inbound').length,
  analytics: {
    daily: activityDays([...sampleDays.values()], latestSample),
    conversations: {
      new: demoConversations.filter((c) => c.inquiryStatus === 'new').length,
      inProgress: demoConversations.filter((c) => c.inquiryStatus === 'inProgress').length,
      closed: demoConversations.filter((c) => c.inquiryStatus === 'closed').length,
    },
  },
};
