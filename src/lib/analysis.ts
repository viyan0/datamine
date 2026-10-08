import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { agencies, conversations, messages } from '@/db/schema';
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
    stale:
      !!c.analysis &&
      c.analysis.sourceHash !==
        fingerprint(await sourceMessages(c), c.analysis.locale, await businessContext(agencyId)),
  };
}
export async function analyzeConversation(agencyId: string, id: string, locale: string) {
  const c = await getConversation(agencyId, id);
  const source = await sourceMessages(c);
  if (!source.some((m) => m.direction === 'inbound'))
    throw new AnalysisError('analysisNoText', 422);
  const business = await businessContext(agencyId);
  const sourceHash = fingerprint(source, locale, business);
  if (c.analysis?.sourceHash === sourceHash) return c.analysis;
  if (!analysisConfigured()) throw new AnalysisError('analysisNotConfigured', 503);
  const db = getDb(),
    runId = randomUUID();
  const [claimed] = await db
    .update(conversations)
    .set({ analysisRunId: runId, analysisStartedAt: new Date() })
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
    const output = await analyzeWithHaiku(source, locale, business);
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
    const [saved] = await db
      .update(conversations)
      .set({ analysis })
      .where(and(eq(conversations.id, id), eq(conversations.analysisRunId, runId)))
      .returning({ id: conversations.id });
    if (!saved) throw new AnalysisError('analysisChanged', 409);
    return analysis;
  } finally {
    await db
      .update(conversations)
      .set({ analysisRunId: null, analysisStartedAt: null })
      .where(and(eq(conversations.id, id), eq(conversations.analysisRunId, runId)));
  }
}
