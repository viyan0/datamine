import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  uniqueIndex,
  index,
  numeric,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { SavedAnalysis } from '@/lib/analysis-types';

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
export const user = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  platformRole: text('platform_role').default('staff').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
export const session = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);
export const account = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
);
export const verification = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);
export const rateLimit = pgTable('rate_limits', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
export const agencies = pgTable('agencies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  locale: text('locale').default('en').notNull(),
  industry: text('industry').default('General business').notNull(),
  categories: jsonb('categories').$type<string[]>().default([]).notNull(),
  createdAt: createdAt(),
});
export const memberships = pgTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    agencyId: text('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('membership_unique').on(t.agencyId, t.userId),
    index('membership_user_idx').on(t.userId),
  ],
);
export const invitations = pgTable('invitations', {
  id: text('id').primaryKey(),
  agencyId: text('agency_id')
    .notNull()
    .references(() => agencies.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
});
export const connections = pgTable(
  'whatsapp_connections',
  {
    id: text('id').primaryKey(),
    agencyId: text('agency_id')
      .notNull()
      .references(() => agencies.id),
    label: text('label').notNull(),
    phoneNumberId: text('phone_number_id').notNull().unique(),
    wabaId: text('waba_id').notNull(),
    displayPhone: text('display_phone').notNull(),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    appSecretEncrypted: text('app_secret_encrypted').notNull(),
    status: text('status').default('configured').notNull(),
    lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    campaignSender: boolean('campaign_sender').default(false).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('connection_agency_idx').on(t.agencyId)],
);
export const providerEvents = pgTable(
  'provider_events',
  {
    id: text('id').primaryKey(),
    agencyId: text('agency_id')
      .notNull()
      .references(() => agencies.id),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    dedupeKey: text('dedupe_key').notNull().unique(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: createdAt(),
  },
  (t) => [index('event_agency_idx').on(t.agencyId)],
);
export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    agencyId: text('agency_id')
      .notNull()
      .references(() => agencies.id),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    providerMessageId: text('provider_message_id'),
    requestId: text('request_id'),
    deliveryStatus: text('delivery_status').default('received').notNull(),
    direction: text('direction').notNull(),
    contactPhone: text('contact_phone').notNull(),
    type: text('type').notNull(),
    body: text('body'),
    imageUrl: text('image_url'),
    providerTimestamp: timestamp('provider_timestamp', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('message_provider_unique').on(t.connectionId, t.providerMessageId),
    uniqueIndex('message_request_unique').on(t.requestId),
    index('message_thread_idx').on(t.connectionId, t.contactPhone, t.providerTimestamp),
    index('message_agency_idx').on(t.agencyId),
  ],
);
// One customer thread per connected agency number keeps the demo deliberately small.
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    agencyId: text('agency_id')
      .notNull()
      .references(() => agencies.id),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id),
    contactPhone: text('contact_phone').notNull(),
    name: text('name').notNull(),
    service: text('service').default('other').notNull(),
    destination: text('destination').default('').notNull(),
    inquiryStatus: text('inquiry_status').default('new').notNull(),
    note: text('note').default('').notNull(),
    analysis: jsonb('analysis').$type<SavedAnalysis>(),
    analysisRunId: text('analysis_run_id'),
    analysisStartedAt: timestamp('analysis_started_at', { withTimezone: true }),
    analysisDueAt: timestamp('analysis_due_at', { withTimezone: true }).defaultNow(),
    analysisStatus: text('analysis_status').default('pending').notNull(),
    analysisError: text('analysis_error'),
    analysisAttempts: integer('analysis_attempts').default(0).notNull(),
    analysisRevision: integer('analysis_revision').default(0).notNull(),
    manualFields: jsonb('manual_fields').$type<string[]>().default([]).notNull(),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }).notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('conversation_contact_unique').on(t.connectionId, t.contactPhone),
    index('conversation_agency_idx').on(t.agencyId, t.lastMessageAt),
  ],
);
export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey(),
  agencyId: text('agency_id').references(() => agencies.id),
  actorId: text('actor_id').references(() => user.id),
  action: text('action').notNull(),
  details: jsonb('details').$type<Record<string, string>>().notNull().default({}),
  createdAt: createdAt(),
});
export const enrollmentLinks = pgTable('enrollment_links', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  codeHash: text('code_hash'),
  codeExpiresAt: timestamp('code_expires_at', { withTimezone: true }),
  codeSentAt: timestamp('code_sent_at', { withTimezone: true }),
  sends: integer('sends').default(0).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  sessionHash: text('session_hash').unique(),
  sessionExpiresAt: timestamp('session_expires_at', { withTimezone: true }),
  createdAt: createdAt(),
});
export const sharedProfiles = pgTable('shared_profiles', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull().unique(),
  name: text('name').notNull(),
  language: text('language').notNull(),
  destination: text('destination').default('').notNull(),
  interests: jsonb('interests').$type<string[]>().notNull().default([]),
  blockedTopics: jsonb('blocked_topics').$type<string[]>().notNull().default([]),
  status: text('status').default('active').notNull(),
  offerHold: boolean('offer_hold').default(false).notNull(),
  automaticInterests: boolean('automatic_interests').default(false).notNull(),
  consentVersion: text('consent_version').notNull(),
  consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// One choice covers Datamine collection, AI-derived interests and promotional enrollment.
export const customerConsents = pgTable('customer_consents', {
  phone: text('phone').primaryKey(),
  status: text('status').default('pending').notNull(),
  locale: text('locale').notNull(),
  noticeVersion: text('notice_version').notNull(),
  noticeAt: timestamp('notice_at', { withTimezone: true }),
  decisionAt: timestamp('decision_at', { withTimezone: true }),
  decisionMessageId: text('decision_message_id'),
  lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }).notNull(),
  replyConnectionId: text('reply_connection_id')
    .notNull()
    .references(() => connections.id),
  replyMessageId: text('reply_message_id').notNull().unique(),
  replyStatus: text('reply_status').default('queued').notNull(),
  replyStartedAt: timestamp('reply_started_at', { withTimezone: true }),
  createdAt: createdAt(),
});
export const consentInvitations = pgTable('consent_invitations', {
  phone: text('phone').primaryKey(),
  connectionId: text('connection_id')
    .notNull()
    .references(() => connections.id),
  locale: text('locale').notNull(),
  messageId: text('message_id').notNull().unique(),
  status: text('status').default('queued').notNull(),
  lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  createdAt: createdAt(),
});
export const profileEvents = pgTable('profile_events', {
  id: text('id').primaryKey(),
  profileId: text('profile_id')
    .notNull()
    .references(() => sharedProfiles.id),
  action: text('action').notNull(),
  noticeVersion: text('notice_version').notNull(),
  locale: text('locale').notNull(),
  channel: text('channel').default('customer_portal').notNull(),
  createdAt: createdAt(),
});
export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    agencyId: text('agency_id')
      .notNull()
      .references(() => agencies.id),
    name: text('name').notNull(),
    description: text('description').default('').notNull(),
    contactPhone: text('contact_phone').default('').notNull(),
    imageUrl: text('image_url').default('').notNull(),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').default('IQD').notNull(),
    locale: text('locale').default('en').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .default(sql`now() + interval '7 days'`)
      .notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('product_agency_idx').on(t.agencyId),
    check('product_price_nonnegative', sql`${t.price} >= 0`),
    check('product_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: text('id').primaryKey(),
    agencyId: text('agency_id')
      .notNull()
      .references(() => agencies.id),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    title: text('title').notNull(),
    offerText: text('offer_text').notNull(),
    contactPhone: text('contact_phone').default('').notNull(),
    imageUrl: text('image_url').default('').notNull(),
    productId: text('product_id').references(() => products.id),
    catalogOnly: boolean('catalog_only').default(false).notNull(),
    networkEnabled: boolean('network_enabled').default(false).notNull(),
    networkExpiresAt: timestamp('network_expires_at', { withTimezone: true }),
    locale: text('locale').notNull(),
    status: text('status').default('matching').notNull(),
    senderId: text('sender_id').references(() => connections.id),
    deliveryMode: text('delivery_mode').$type<'template' | 'reply'>().default('template').notNull(),
    template: jsonb('template').$type<{
      id: string;
      name: string;
      language: string;
      body: string;
    }>(),
    analysis: jsonb('analysis').$type<{
      summary: string;
      categories: string[];
      model: string;
      sourceHash: string;
    }>(),
    dueAt: timestamp('due_at', { withTimezone: true }).defaultNow(),
    runId: text('run_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    attempts: integer('attempts').default(0).notNull(),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('campaign_catalog_product_unique')
      .on(t.productId)
      .where(sql`${t.catalogOnly} = true`),
  ],
);
export const campaignRecipients = pgTable(
  'campaign_recipients',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id),
    profileId: text('profile_id')
      .notNull()
      .references(() => sharedProfiles.id),
    profileUpdatedAt: timestamp('profile_updated_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    status: text('status').default('matched').notNull(),
    messageId: text('message_id').references(() => messages.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('campaign_recipient_unique').on(t.campaignId, t.profileId)],
);

// Each customer message can request at most one automatic recommendation.
export const recommendationJobs = pgTable(
  'recommendation_jobs',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => sharedProfiles.id),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    triggerMessageId: text('trigger_message_id')
      .notNull()
      .unique()
      .references(() => messages.id),
    mode: text('mode').$type<'interest' | 'more' | 'stop' | 'response'>().notNull(),
    waitingForOffer: boolean('waiting_for_offer').default(false).notNull(),
    noticeMessageId: text('notice_message_id').references(() => messages.id),
    offerCheckHash: text('offer_check_hash'),
    status: text('status').default('pending').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    profileUpdatedAt: timestamp('profile_updated_at', { withTimezone: true }).notNull(),
    sourceHash: text('source_hash'),
    topic: text('topic'),
    campaignId: text('campaign_id').references(() => campaigns.id),
    campaignHash: text('campaign_hash'),
    reason: text('reason'),
    body: text('body'),
    messageId: text('message_id').references(() => messages.id),
    imageUrl: text('image_url'),
    dueAt: timestamp('due_at', { withTimezone: true }).defaultNow(),
    runId: text('run_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    attempts: integer('attempts').default(0).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('recommendation_due_idx').on(t.status, t.dueAt),
    index('recommendation_profile_idx').on(t.profileId),
  ],
);
