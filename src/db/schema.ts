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
} from 'drizzle-orm/pg-core';

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
    providerMessageId: text('provider_message_id').notNull(),
    direction: text('direction').notNull(),
    contactPhone: text('contact_phone').notNull(),
    type: text('type').notNull(),
    body: text('body'),
    providerTimestamp: timestamp('provider_timestamp', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('message_provider_unique').on(t.connectionId, t.providerMessageId),
    index('message_agency_idx').on(t.agencyId),
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
