import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { agencies, conversations, messages, sharedProfiles, customerConsents } from '@/db/schema';
import { consentAllowsAnalysis, syncCustomerInterests, clearCustomerData } from './consent';
import type { BusinessContext } from './business';
import { getConversation } from './inbox';
import {
  analysisModel,
  analysisVersion,
  type SavedAnalysis,
  type SourceMessage,
} from './analysis-types';
import { AnalysisError, analysisConfigured, analyzeWithHaiku } from './anthropic';

async function sourceMessages(c: typeof conversations.$inferSelect): Promise<SourceMessage[]> {
  const rows = await getDb()
    .select({
      id: messages.id,
      body: messages.body,
      direction: messages.direction,
      timestamp: messages.providerTimestamp,
    })
    .from(messages)
    .where(
      and(
        eq(messages.agencyId, c.agencyId),
        eq(messages.connectionId, c.connectionId),
        eq(messages.contactPhone, c.contactPhone),
        eq(messages.type, 'text'),
        or(
          eq(messages.direction, 'inbound'),
          inArray(messages.deliveryStatus, ['accepted', 'sent', 'delivered', 'read']),
        ),
      ),
    )
    .orderBy(desc(messages.providerTimestamp), desc(messages.id))
    .limit(30);
  let remaining = 16000;
  const source: SourceMessage[] = [];
  for (const m of rows) {
    if (!m.body?.trim() || remaining <= 0) continue;
    const body = m.body.slice(0, Math.min(3000, remaining));
    source.push({ ...m, body, timestamp: m.timestamp.toISOString() });
    remaining -= body.length;
  }
  return source.reverse();
}
async function businessContext(id: string): Promise<BusinessContext> {
  const [business] = await getDb()
    .select({ industry: agencies.industry, categories: agencies.categories })
    .from(agencies)
    .where(eq(agencies.id, id));
  return business;
}
function fingerprint(source: SourceMessage[], locale: string, business: BusinessContext) {
  return createHash('sha256')
    .update(JSON.stringify([analysisVersion, analysisModel, locale, business, source]))
    .digest('hex');
}
export async function getAnalysisState(agencyId: string, id: string) {
  const c = await getConversation(agencyId, id);
  return {
    analysis: c.analysis?.version === analysisVersion ? c.analysis : null,
    configured: analysisConfigured(),
    status: (await consentAllowsAnalysis(c.contactPhone)) ? c.analysisStatus : 'awaitingConsent',
    error: c.analysisError,
    stale:
      !!c.analysis &&
      c.analysis.sourceHash !==
        fingerprint(await sourceMessages(c), c.analysis.locale, await businessContext(agencyId)),
  };
}
export async function analyzeConversation(agencyId: string, id: string, locale: string) {
  const c = await getConversation(agencyId, id);
  if (!(await consentAllowsAnalysis(c.contactPhone)))
    throw new AnalysisError('analysisConsentRequired', 409);
  const source = await sourceMessages(c);
  if (!source.some((m) => m.direction === 'inbound'))
    throw new AnalysisError('analysisNoText', 422);
  const business = await businessContext(agencyId);
  const sourceHash = fingerprint(source, locale, business);
  if (c.analysis?.sourceHash === sourceHash) {
    await getDb().transaction(async (tx) => {
      const [consent] = await tx
        .select()
        .from(customerConsents)
        .where(eq(customerConsents.phone, c.contactPhone))
        .for('update');
      if (consent?.status !== 'accepted') throw new AnalysisError('analysisConsentRequired', 409);
      await tx
        .update(conversations)
        .set({ analysisStatus: 'complete', analysisDueAt: null, analysisError: null })
        .where(
          and(eq(conversations.id, id), eq(conversations.analysisRevision, c.analysisRevision)),
        );
      await syncCustomerInterests(tx, c.contactPhone);
    });
    return c.analysis;
  }
  if (!analysisConfigured()) throw new AnalysisError('analysisNotConfigured', 503);
  const db = getDb(),
    runId = randomUUID();
  const [claimed] = await db
    .update(conversations)
    .set({
      analysisRunId: runId,
      analysisStartedAt: new Date(),
      analysisStatus: 'processing',
      analysisAttempts: sql`${conversations.analysisAttempts} + 1`,
    })
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.agencyId, agencyId),
        or(
          isNull(conversations.analysisRunId),
          lt(conversations.analysisStartedAt, new Date(Date.now() - 90000)),
        ),
      ),
    )
    .returning({ id: conversations.id });
  if (!claimed) throw new AnalysisError('analysisBusy', 409);
  try {
    const known = await db
      .selectDistinct({ category: conversations.service })
      .from(conversations)
      .where(eq(conversations.agencyId, agencyId))
      .limit(50);
    const output = await analyzeWithHaiku(
      source,
      locale,
      business,
      known.map((r) => r.category).filter((v) => v !== 'other'),
    );
    if (
      fingerprint(await sourceMessages(c), locale, await businessContext(agencyId)) !== sourceHash
    )
      throw new AnalysisError('analysisChanged', 409);
    const analysis: SavedAnalysis = {
      ...output,
      model: analysisModel,
      version: analysisVersion,
      locale,
      sourceHash,
      createdAt: new Date().toISOString(),
      sourceMessageIds: source.map((m) => m.id),
    };
    await db.transaction(async (tx) => {
      const [consent] = await tx
        .select()
        .from(customerConsents)
        .where(eq(customerConsents.phone, c.contactPhone))
        .for('update');
      if (consent?.status !== 'accepted') throw new AnalysisError('analysisConsentRequired', 409);
      const [current] = await tx
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.analysisRunId, runId)))
        .for('update');
      if (!current || current.analysisRevision !== c.analysisRevision)
        throw new AnalysisError('analysisChanged', 409);
      await tx
        .update(conversations)
        .set({
          analysis,
          analysisStatus: 'complete',
          analysisError: null,
          analysisDueAt: null,
          analysisAttempts: 0,
          ...(!current.manualFields.includes('service')
            ? { service: analysis.result.services[0] || 'other' }
            : {}),
          ...(!current.manualFields.includes('destination')
            ? { destination: analysis.result.subject?.value.slice(0, 160) || '' }
            : {}),
          ...(!current.manualFields.includes('inquiryStatus')
            ? { inquiryStatus: analysis.result.inquiryStatus }
            : {}),
        })
        .where(eq(conversations.id, id));
      const [profile] = await tx
        .select()
        .from(sharedProfiles)
        .where(eq(sharedProfiles.phone, c.contactPhone))
        .for('update');
      const [stopMessage] = analysis.result.stopOffers
        ? await tx
            .select({ createdAt: messages.createdAt })
            .from(messages)
            .where(eq(messages.id, analysis.result.stopOffers.messageId))
        : [];
      // A fresh explicit enrollment supersedes an earlier withdrawal in the history.
      const optOut =
        !!profile &&
        profile.status === 'active' &&
        !!stopMessage &&
        stopMessage.createdAt >= profile.consentAt;
      if (profile && optOut) {
        await clearCustomerData(tx, c.contactPhone);
        await tx
          .update(customerConsents)
          .set({
            status: 'declined',
            decisionAt: new Date(),
            decisionMessageId: analysis.result.stopOffers!.messageId,
            replyStatus: 'queued',
            replyMessageId: randomUUID(),
            replyConnectionId: c.connectionId,
            replyStartedAt: null,
          })
          .where(eq(customerConsents.phone, c.contactPhone));
        return;
      }
      await syncCustomerInterests(tx, c.contactPhone);
    });
    return analysis;
  } finally {
    await db
      .update(conversations)
      .set({ analysisRunId: null, analysisStartedAt: null })
      .where(and(eq(conversations.id, id), eq(conversations.analysisRunId, runId)));
  }
}

export async function processPendingAnalysis(limit = 3) {
  if (!analysisConfigured()) return 0;
  const db = getDb();
  const due = await db
    .select({
      id: conversations.id,
      agencyId: conversations.agencyId,
      locale: agencies.locale,
      revision: conversations.analysisRevision,
    })
    .from(conversations)
    .innerJoin(agencies, eq(agencies.id, conversations.agencyId))
    .innerJoin(
      customerConsents,
      and(
        eq(customerConsents.phone, conversations.contactPhone),
        eq(customerConsents.status, 'accepted'),
      ),
    )
    .where(
      and(
        lt(conversations.analysisDueAt, new Date()),
        or(
          isNull(conversations.analysisRunId),
          lt(conversations.analysisStartedAt, new Date(Date.now() - 90000)),
        ),
      ),
    )
    .orderBy(conversations.analysisDueAt)
    .limit(limit);
  for (const item of due) {
    try {
      await analyzeConversation(item.agencyId, item.id, item.locale);
    } catch (error) {
      const code = error instanceof AnalysisError ? error.code : 'analysisUnavailable';
      if (code === 'analysisBusy') continue;
      const [current] = await db.select().from(conversations).where(eq(conversations.id, item.id));
      if (!current) continue;
      const changed = code === 'analysisChanged' || current.analysisRevision !== item.revision;
      await db
        .update(conversations)
        .set({
          analysisStatus: changed
            ? 'pending'
            : ['analysisNoText', 'analysisConsentRequired'].includes(code)
              ? 'waitingForText'
              : 'error',
          analysisError: changed ? null : code,
          analysisDueAt:
            ['analysisNoText', 'analysisConsentRequired'].includes(code) && !changed
              ? null
              : new Date(
                  Date.now() +
                    (changed
                      ? 2000
                      : Math.min(900000, 15000 * 2 ** Math.min(current.analysisAttempts, 6))),
                ),
        })
        .where(
          and(
            eq(conversations.id, item.id),
            isNull(conversations.analysisRunId),
            eq(conversations.analysisRevision, current.analysisRevision),
          ),
        );
    }
  }
  return due.length;
}
