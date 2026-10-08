import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  agencies,
  connections,
  conversations,
  enrollmentLinks,
  sharedProfiles,
  profileEvents,
  customerConsents,
} from '@/db/schema';
import { HttpError } from './access';
import { appUrl, requiredSecret } from './config';
import { decrypt, digest, secureEqual } from './security';
import { getConversation } from './inbox';
import { replyWindowOpen } from './inbox-types';
import {
  consentVersion,
  maskPhone,
  type ProfileFields,
  type SharedProfile,
} from './enrollment-types';
import { sendMetaText } from './meta';
import { clearCustomerData, refreshOfferAudiences } from './consent';

export const customerCookie = 'datamine-customer';
const lifetime = 30 * 60 * 1000;
function codeDigest(id: string, code: string) {
  return createHmac('sha256', requiredSecret('BETTER_AUTH_SECRET'))
    .update(`${id}:${code}`)
    .digest('hex');
}
function validLink(row: typeof enrollmentLinks.$inferSelect | undefined) {
  if (!row || row.expiresAt.getTime() <= Date.now()) throw new HttpError(410, 'enrollmentExpired');
  return row;
}
export async function createEnrollmentLink(
  agencyId: string,
  conversationId: string,
  locale: string,
) {
  const c = await getConversation(agencyId, conversationId);
  if (!/^\d{7,15}$/.test(c.contactPhone)) throw new HttpError(422, 'invalidInput');
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 3600000);
  await getDb().transaction(async (tx) => {
    // Serialize creation so a conversation cannot issue more than one link per hour.
    await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for('update');
    const [recent] = await tx
      .select()
      .from(enrollmentLinks)
      .where(
        and(
          eq(enrollmentLinks.conversationId, conversationId),
          gt(enrollmentLinks.createdAt, new Date(Date.now() - 3600000)),
        ),
      )
      .limit(1);
    if (recent) throw new HttpError(429, 'enrollmentLinkWait');
    await tx
      .insert(enrollmentLinks)
      .values({ id: randomUUID(), conversationId, tokenHash: digest(token), expiresAt });
  });
  return { url: `${appUrl()}/${locale}/enroll#${token}`, expiresAt: expiresAt.toISOString() };
}
export async function enrollmentInfo(token: string) {
  const [link] = await getDb()
    .select()
    .from(enrollmentLinks)
    .where(eq(enrollmentLinks.tokenHash, digest(token)));
  const valid = validLink(link);
  const [row] = await getDb()
    .select({ phone: conversations.contactPhone, agency: agencies.name })
    .from(conversations)
    .innerJoin(agencies, eq(agencies.id, conversations.agencyId))
    .where(eq(conversations.id, valid.conversationId));
  return { maskedPhone: maskPhone(row.phone), agency: row.agency };
}
export async function sendEnrollmentCode(token: string, locale: string) {
  const db = getDb();
  const reserved = await db.transaction(async (tx) => {
    const [found] = await tx
      .select()
      .from(enrollmentLinks)
      .where(eq(enrollmentLinks.tokenHash, digest(token)))
      .for('update');
    const link = validLink(found);
    if (link.attempts >= 5 || link.sends >= 3 || link.verifiedAt)
      throw new HttpError(429, 'enrollmentLocked');
    if (link.codeSentAt && Date.now() - link.codeSentAt.getTime() < 60000)
      throw new HttpError(429, 'codeWait');
    const [c] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, link.conversationId));
    if (!replyWindowOpen(c.lastInboundAt)) throw new HttpError(409, 'codeWindowClosed');
    const [connection] = await tx
      .select()
      .from(connections)
      .where(eq(connections.id, c.connectionId));
    const code = String(randomInt(100000, 1000000));
    await tx
      .update(enrollmentLinks)
      .set({
        codeHash: codeDigest(link.id, code),
        codeExpiresAt: new Date(Date.now() + 600000),
        codeSentAt: new Date(),
        sends: link.sends + 1,
      })
      .where(eq(enrollmentLinks.id, link.id));
    return { id: link.id, code, c, connection };
  });
  const copy: Record<string, string> = {
    en: `Your Datamine verification code is ${reserved.code}. It expires in 10 minutes. Do not share it. This verifies your number only; it does not sign you up for offers.`,
    ar: `رمز التحقق من Datamine هو ${reserved.code}. تنتهي صلاحيته خلال 10 دقائق. لا تشاركه. هذا للتحقق من رقمك فقط ولا يشترك بك في العروض.`,
    ckb: `کۆدی پشتڕاستکردنەوەی Datamine: ${reserved.code}. دوای ١٠ خولەک بەسەر دەچێت. بە کەس مەیدە. ئەمە تەنها ژمارەکەت پشتڕاست دەکاتەوە و بەشداریت لە ئۆفەرەکان ناکات.`,
  };
  const result = await sendMetaText({
    phoneNumberId: reserved.connection.phoneNumberId,
    accessToken: decrypt(
      reserved.connection.accessTokenEncrypted,
      `${reserved.connection.id}:token`,
    ),
    to: reserved.c.contactPhone,
    body: copy[locale] || copy.en,
    messageId: randomUUID(),
  });
  // Codes are deliberately excluded from the agency message history and API responses.
  if (result.status === 'failed') {
    await db
      .update(enrollmentLinks)
      .set({ codeHash: null })
      .where(eq(enrollmentLinks.id, reserved.id));
    throw new HttpError(502, 'codeSendFailed');
  }
  return { uncertain: result.status === 'uncertain' };
}
export async function verifyEnrollmentCode(token: string, code: string) {
  const sessionToken = randomBytes(32).toString('hex');
  const result = await getDb().transaction(async (tx) => {
    const [found] = await tx
      .select()
      .from(enrollmentLinks)
      .where(eq(enrollmentLinks.tokenHash, digest(token)))
      .for('update');
    const link = validLink(found);
    if (link.attempts >= 5) return 'enrollmentLocked';
    if (
      !link.codeHash ||
      !link.codeExpiresAt ||
      link.codeExpiresAt.getTime() <= Date.now() ||
      link.verifiedAt
    )
      return 'codeInvalid';
    if (!secureEqual(link.codeHash, codeDigest(link.id, code))) {
      await tx
        .update(enrollmentLinks)
        .set({ attempts: link.attempts + 1 })
        .where(eq(enrollmentLinks.id, link.id));
      return 'codeInvalid';
    }
    await tx
      .update(enrollmentLinks)
      .set({
        codeHash: null,
        verifiedAt: new Date(),
        sessionHash: digest(sessionToken),
        sessionExpiresAt: new Date(Date.now() + lifetime),
      })
      .where(eq(enrollmentLinks.id, link.id));
    return null;
  });
  if (result) throw new HttpError(400, result);
  return sessionToken;
}
export async function customerSession(token: string | undefined) {
  if (!token) throw new HttpError(401, 'customerSessionExpired');
  const [row] = await getDb()
    .select({ phone: conversations.contactPhone })
    .from(enrollmentLinks)
    .innerJoin(conversations, eq(conversations.id, enrollmentLinks.conversationId))
    .where(
      and(
        eq(enrollmentLinks.sessionHash, digest(token)),
        gt(enrollmentLinks.sessionExpiresAt, new Date()),
      ),
    );
  if (!row) throw new HttpError(401, 'customerSessionExpired');
  return row;
}
function serialize(p: typeof sharedProfiles.$inferSelect): SharedProfile {
  return {
    id: p.id,
    phone: p.phone,
    name: p.name,
    language: p.language as ProfileFields['language'],
    destination: p.destination,
    interests: p.interests as ProfileFields['interests'],
    status: p.status,
    consentAt: p.consentAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
export async function customerProfile(phone: string) {
  const [profile] = await getDb()
    .select()
    .from(sharedProfiles)
    .where(eq(sharedProfiles.phone, phone));
  return { phone, profile: profile ? serialize(profile) : null };
}
export async function saveCustomerProfile(
  phone: string,
  fields: ProfileFields,
  locale: string,
  enroll: boolean,
) {
  const profile = await getDb().transaction(async (tx) => {
    const [thread] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.contactPhone, phone))
      .orderBy(desc(conversations.lastInboundAt))
      .limit(1);
    if (enroll) {
      if (!thread) throw new HttpError(404, 'notFound');
      await tx
        .insert(customerConsents)
        .values({
          phone,
          status: 'accepted',
          locale,
          noticeVersion: consentVersion,
          noticeAt: new Date(),
          decisionAt: new Date(),
          lastInboundAt: thread.lastInboundAt,
          replyConnectionId: thread.connectionId,
          replyMessageId: randomUUID(),
          replyStatus: 'portal',
        })
        .onConflictDoUpdate({
          target: customerConsents.phone,
          set: {
            status: 'accepted',
            noticeVersion: consentVersion,
            noticeAt: new Date(),
            decisionAt: new Date(),
            replyStatus: 'portal',
          },
        });
      await tx
        .update(conversations)
        .set({
          analysisStatus: 'pending',
          analysisDueAt: new Date(),
          analysisAttempts: 0,
          analysisError: null,
        })
        .where(eq(conversations.contactPhone, phone));
      const [saved] = await tx
        .insert(sharedProfiles)
        .values({
          id: randomUUID(),
          phone,
          ...fields,
          automaticInterests: true,
          consentVersion,
          consentAt: new Date(),
        })
        .onConflictDoUpdate({
          target: sharedProfiles.phone,
          set: {
            ...fields,
            status: 'active',
            automaticInterests: true,
            offerHold: false,
            consentVersion,
            consentAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();
      await tx.insert(profileEvents).values({
        id: randomUUID(),
        profileId: saved.id,
        action: 'enrolled',
        noticeVersion: consentVersion,
        locale,
      });
      await refreshOfferAudiences(tx, [locale, fields.language]);
      return saved;
    }
    const [saved] = await tx
      .update(sharedProfiles)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(sharedProfiles.phone, phone))
      .returning();
    if (!saved) throw new HttpError(404, 'notFound');
    await tx.insert(profileEvents).values({
      id: randomUUID(),
      profileId: saved.id,
      action: 'preferencesUpdated',
      noticeVersion: saved.consentVersion,
      locale,
    });
    await refreshOfferAudiences(tx, [locale, fields.language]);
    return saved;
  });
  return serialize(profile);
}
export async function optOutCustomer(phone: string, locale: string) {
  await getDb().transaction(async (tx) => {
    await tx
      .update(customerConsents)
      .set({ status: 'declined', locale, decisionAt: new Date(), replyStatus: 'portal' })
      .where(eq(customerConsents.phone, phone));
    await clearCustomerData(tx, phone);
  });
  return customerProfile(phone);
}
export async function listSharedProfiles() {
  return (await getDb().select().from(sharedProfiles).orderBy(desc(sharedProfiles.updatedAt))).map(
    serialize,
  );
}
