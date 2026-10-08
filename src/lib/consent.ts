import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  agencies,
  campaigns,
  campaignRecipients,
  connections,
  conversations,
  customerConsents,
  enrollmentLinks,
  messages,
  profileEvents,
  providerEvents,
  sharedProfiles,
} from '@/db/schema';
import { decrypt } from './security';
import { sendMetaText } from './meta';
import { replyWindowOpen } from './inbox-types';

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
export const whatsappConsentVersion = '2026-10-08-whatsapp-v2';
export function consentChoice(text: string, status: string) {
  const value = text
    .trim()
    .replace(/[.!؟\s]+$/u, '')
    .toLocaleLowerCase();
  if (/^(stop|unsubscribe|stop offers|إلغاء الاشتراك|توقف|وەستان|وازهێنان)$/u.test(value))
    return 'declined';
  if (status !== 'accepted' && /^(no|لا|كلا|نەخێر|نە)$/u.test(value)) return 'declined';
  if (status !== 'accepted' && /^(yes|agree|نعم|أوافق|اوافق|بەڵێ|ڕازیم)$/u.test(value))
    return 'accepted';
  return null;
}
export function consentReply(status: string, locale: string) {
  const copy = {
    en: {
      pending:
        'Datamine: May we save and analyse your WhatsApp messages with AI to learn your interests and send you relevant promotions from Datamine and participating businesses? Reply YES to accept once, or NO to decline. Your chat is held without AI processing while you decide; NO removes it and blocks further collection. We keep only a minimal record of your choice. You can withdraw later by replying STOP.',
      accepted:
        'Thank you. Your Datamine consent is saved and you are enrolled. AI will update your interests and match relevant offers automatically. No extra enrollment is needed. Reply STOP at any time to withdraw.',
      declined:
        'Understood. Datamine has removed your saved chat and interest profile and will not collect further chat messages or send promotions. Only a minimal record of your choice is kept. Reply YES if you later choose to join.',
    },
    ar: {
      pending:
        'Datamine: هل توافق على حفظ رسائل واتساب وتحليلها بالذكاء الاصطناعي لمعرفة اهتماماتك وإرسال عروض مناسبة من Datamine والشركات المشاركة؟ أرسل نعم للموافقة مرة واحدة أو لا للرفض. تُحفظ المحادثة مؤقتاً دون تحليل حتى تختار؛ الرفض يحذفها ويوقف جمع الرسائل. نحتفظ فقط بسجل مختصر لاختيارك. يمكنك الانسحاب لاحقاً بإرسال STOP.',
      accepted:
        'شكراً. حُفظت موافقتك وانضممت إلى Datamine. سيحدّث الذكاء الاصطناعي اهتماماتك ويطابق العروض تلقائياً دون تسجيل إضافي. أرسل STOP للانسحاب في أي وقت.',
      declined:
        'تم حذف المحادثة المحفوظة وملف اهتماماتك. لن يجمع Datamine رسائل أخرى أو يرسل عروضاً. نحتفظ فقط بسجل مختصر لاختيارك. أرسل نعم إذا أردت الانضمام لاحقاً.',
    },
    ckb: {
      pending:
        'Datamine: ڕازیت پەیامەکانی واتساپت هەڵبگرین و بە زیرەکی دەستکرد شیکاری بکەین بۆ ناسینی ئارەزووەکانت و ناردنی ئۆفەری گونجاو لە Datamine و کاروبارە بەشدارەکان؟ یەک جار بەڵێ بنێر بۆ ڕەزامەندی یان نەخێر بۆ ڕەتکردنەوە. تا هەڵدەبژێریت گفتوگۆکە بە کاتی هەڵدەگیرێت بەبێ شیکاری؛ نەخێر بیسڕێتەوە و کۆکردنەوە دەوەستێنێت. تەنها تۆمارێکی کەم لە هەڵبژاردنت دەپارێزین. دواتر STOP بنێر بۆ وەستان.',
      accepted:
        'سوپاس. ڕەزامەندیت تۆمار کرا و بوویتە ئەندامی Datamine. زیرەکی دەستکرد ئارەزووەکانت نوێ دەکاتەوە و ئۆفەرە گونجاوەکان خۆکار هاوتا دەکات. تۆمارکردنی دووبارە پێویست نییە. بۆ وەستان STOP بنێرە.',
      declined:
        'گفتوگۆی هەڵگیراو و پرۆفایلی ئارەزووەکانت سڕایەوە. Datamine پەیامی دیکە کۆناکاتەوە و ئۆفەر نانێرێت. تەنها تۆمارێکی کەم لە هەڵبژاردنت دەپارێزین. ئەگەر دواتر دەتەوێت بەشدار بیت، بەڵێ بنێرە.',
    },
  };
  return (copy[locale as keyof typeof copy] || copy.en)[
    status as 'pending' | 'accepted' | 'declined'
  ];
}
export async function refreshOfferAudiences(tx: Transaction, locales: string[]) {
  if (!locales.length) return;
  await tx
    .update(campaigns)
    .set({ status: 'matching', dueAt: new Date(), analysis: null, error: null, attempts: 0 })
    .where(
      and(
        inArray(campaigns.status, ['ready', 'matching', 'error']),
        inArray(campaigns.locale, [...new Set(locales)]),
      ),
    );
}
export async function clearCustomerData(tx: Transaction, phone: string) {
  const profiles = await tx.select().from(sharedProfiles).where(eq(sharedProfiles.phone, phone));
  for (const p of profiles) {
    await tx.delete(campaignRecipients).where(eq(campaignRecipients.profileId, p.id));
    await tx.delete(profileEvents).where(eq(profileEvents.profileId, p.id));
    await tx.delete(sharedProfiles).where(eq(sharedProfiles.id, p.id));
  }
  const threads = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.contactPhone, phone));
  if (threads.length)
    await tx.delete(enrollmentLinks).where(
      inArray(
        enrollmentLinks.conversationId,
        threads.map((c) => c.id),
      ),
    );
  await tx
    .delete(campaignRecipients)
    .where(
      inArray(
        campaignRecipients.messageId,
        tx.select({ id: messages.id }).from(messages).where(eq(messages.contactPhone, phone)),
      ),
    );
  await tx.delete(messages).where(eq(messages.contactPhone, phone));
  await tx.delete(conversations).where(eq(conversations.contactPhone, phone));
  await tx
    .delete(providerEvents)
    .where(
      sql`${providerEvents.payload}->>'from'=${phone} or ${providerEvents.payload}->>'recipient_id'=${phone}`,
    );
  await refreshOfferAudiences(
    tx,
    profiles.map((p) => p.language),
  );
}
export async function handleCustomerConsent(
  tx: Transaction,
  input: {
    phone: string;
    connectionId: string;
    agencyId: string;
    messageId: string;
    text: string;
    name: string;
    timestamp: Date;
  },
) {
  const [business] = await tx
    .select({ locale: agencies.locale })
    .from(agencies)
    .where(eq(agencies.id, input.agencyId));
  await tx
    .insert(customerConsents)
    .values({
      phone: input.phone,
      locale: business.locale,
      noticeVersion: whatsappConsentVersion,
      lastInboundAt: input.timestamp,
      replyConnectionId: input.connectionId,
      replyMessageId: randomUUID(),
    })
    .onConflictDoNothing();
  const [c] = await tx
    .select()
    .from(customerConsents)
    .where(eq(customerConsents.phone, input.phone))
    .for('update');
  if (c.decisionMessageId === input.messageId)
    return { store: false, accepted: c.status === 'accepted' };
  // Old webhook deliveries cannot reverse a more recent choice.
  if (c.decisionAt && input.timestamp.getTime() < Math.floor(c.decisionAt.getTime() / 1000) * 1000)
    return { store: false, accepted: c.status === 'accepted' };
  const choice = consentChoice(input.text, c.status);
  if (choice === 'declined' && c.status !== 'declined') {
    await clearCustomerData(tx, input.phone);
    await tx
      .update(customerConsents)
      .set({
        status: 'declined',
        decisionAt: input.timestamp,
        decisionMessageId: input.messageId,
        lastInboundAt: input.timestamp,
        replyConnectionId: input.connectionId,
        replyMessageId: randomUUID(),
        replyStatus: 'queued',
        replyStartedAt: null,
      })
      .where(eq(customerConsents.phone, input.phone));
    return { store: false, accepted: false };
  }
  if (
    choice === 'accepted' &&
    c.noticeAt &&
    input.timestamp.getTime() >= Math.floor(c.noticeAt.getTime() / 1000) * 1000
  ) {
    await tx
      .update(customerConsents)
      .set({
        status: 'accepted',
        decisionAt: input.timestamp,
        decisionMessageId: input.messageId,
        lastInboundAt: input.timestamp,
        replyConnectionId: input.connectionId,
        replyMessageId: randomUUID(),
        replyStatus: 'queued',
        replyStartedAt: null,
      })
      .where(eq(customerConsents.phone, input.phone));
    const [profile] = await tx
      .insert(sharedProfiles)
      .values({
        id: randomUUID(),
        phone: input.phone,
        name: input.name,
        language: c.locale,
        interests: [],
        automaticInterests: true,
        offerHold: true,
        consentVersion: whatsappConsentVersion,
        consentAt: new Date(),
      })
      .onConflictDoUpdate({
        target: sharedProfiles.phone,
        set: {
          status: 'active',
          automaticInterests: true,
          offerHold: true,
          consentVersion: whatsappConsentVersion,
          consentAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    await tx.insert(profileEvents).values({
      id: randomUUID(),
      profileId: profile.id,
      action: 'enrolled',
      noticeVersion: whatsappConsentVersion,
      locale: c.locale,
      channel: 'whatsapp',
    });
    await tx
      .update(conversations)
      .set({
        analysisStatus: 'pending',
        analysisDueAt: new Date(),
        analysisAttempts: 0,
        analysisError: null,
        analysisRevision: sql`${conversations.analysisRevision}+1`,
      })
      .where(eq(conversations.contactPhone, input.phone));
    await refreshOfferAudiences(tx, [c.locale]);
    return { store: false, accepted: true };
  }
  if (choice === 'accepted' && !c.noticeAt && c.status === 'declined') {
    await tx
      .update(customerConsents)
      .set({
        status: 'pending',
        replyStatus: 'queued',
        replyMessageId: randomUUID(),
        replyConnectionId: input.connectionId,
        replyStartedAt: null,
      })
      .where(eq(customerConsents.phone, input.phone));
  }
  await tx
    .update(customerConsents)
    .set({ lastInboundAt: sql`greatest(${customerConsents.lastInboundAt}, ${input.timestamp})` })
    .where(eq(customerConsents.phone, input.phone));
  return {
    store: c.status !== 'declined' && choice !== 'accepted',
    accepted: c.status === 'accepted',
  };
}
export async function consentAllowsAnalysis(phone: string) {
  const [c] = await getDb()
    .select({ status: customerConsents.status })
    .from(customerConsents)
    .where(eq(customerConsents.phone, phone));
  return c?.status === 'accepted';
}
export async function processConsentReplies(limit = 2) {
  const db = getDb();
  await db
    .update(customerConsents)
    .set({ replyStatus: 'uncertain' })
    .where(
      and(
        eq(customerConsents.replyStatus, 'submitting'),
        lt(customerConsents.replyStartedAt, new Date(Date.now() - 90000)),
      ),
    );
  const rows = await db
    .select({ phone: customerConsents.phone })
    .from(customerConsents)
    .where(eq(customerConsents.replyStatus, 'queued'))
    .orderBy(customerConsents.createdAt)
    .limit(limit);
  for (const row of rows) {
    const [c] = await db
      .update(customerConsents)
      .set({
        replyStatus: 'submitting',
        replyStartedAt: new Date(),
      })
      .where(and(eq(customerConsents.phone, row.phone), eq(customerConsents.replyStatus, 'queued')))
      .returning();
    if (!c) continue;
    // Serialize the actual send with YES/NO so an obsolete notice cannot follow a withdrawal.
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(customerConsents)
        .where(
          and(
            eq(customerConsents.phone, c.phone),
            eq(customerConsents.replyMessageId, c.replyMessageId),
            eq(customerConsents.replyStatus, 'submitting'),
          ),
        )
        .for('update');
      if (!current) return;
      let result: { status: string } = { status: 'failed' };
      if (replyWindowOpen(current.lastInboundAt)) {
        const [connection] = await tx
          .select()
          .from(connections)
          .where(eq(connections.id, current.replyConnectionId));
        if (connection)
          result = await sendMetaText({
            phoneNumberId: connection.phoneNumberId,
            accessToken: decrypt(connection.accessTokenEncrypted, `${connection.id}:token`),
            to: current.phone,
            messageId: current.replyMessageId,
            body: consentReply(current.status, current.locale),
          });
      }
      await tx
        .update(customerConsents)
        .set({
          replyStatus: result.status,
          ...(current.status === 'pending'
            ? { noticeAt: result.status === 'failed' ? null : new Date() }
            : {}),
        })
        .where(eq(customerConsents.phone, current.phone));
    });
  }
  return rows.length;
}

// Only AI-derived interests enter the shared audience; chat text and staff notes stay private.
export async function syncCustomerInterests(tx: Transaction, phone: string) {
  const [profile] = await tx
    .select()
    .from(sharedProfiles)
    .where(eq(sharedProfiles.phone, phone))
    .for('update');
  if (!profile || profile.status !== 'active') return;
  const threads = await tx
    .select({ analysis: conversations.analysis, status: conversations.analysisStatus })
    .from(conversations)
    .where(eq(conversations.contactPhone, phone))
    .orderBy(desc(conversations.lastMessageAt));
  const results = threads.filter((t) => t.analysis).map((t) => t.analysis!.result);
  const interests = [
    ...new Map(
      results
        .flatMap((r) => [...r.services, ...(r.subject ? [r.subject.value] : [])])
        .map((value) => [value.toLocaleLowerCase(), value]),
    ).values(),
  ].slice(0, 12);
  const latest = results[0];
  const language =
    latest && ['en', 'ar', 'ckb'].includes(latest.language) ? latest.language : profile.language;
  const offerHold = threads.some((t) => !['complete', 'waitingForText'].includes(t.status));
  const fields = profile.automaticInterests
    ? { interests, language, destination: latest?.subject?.value.slice(0, 160) || '' }
    : {};
  if (
    profile.offerHold === offerHold &&
    (!profile.automaticInterests ||
      (JSON.stringify(profile.interests) === JSON.stringify(interests) &&
        profile.language === language &&
        profile.destination === fields.destination))
  )
    return;
  await tx
    .update(sharedProfiles)
    .set({ ...fields, offerHold, updatedAt: new Date() })
    .where(eq(sharedProfiles.id, profile.id));
  await refreshOfferAudiences(tx, [profile.language, language]);
}
