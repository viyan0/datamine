import { and, eq, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { connections, consentInvitations, customerConsents } from '@/db/schema';
import { centralConnection } from './central-whatsapp';
import { decrypt } from './security';
import { sendMetaText } from './meta';
import { replyWindowOpen } from './inbox-types';

export function invitationCopy(phone: string, locale: string) {
  const link = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent('Get me enrolled in Datamine')}`;
  const copy = {
    en: `Want relevant offers from Datamine and participating businesses? Open Datamine to read the privacy notice and accept once. Your messages will not be analysed until you agree.\n${link}`,
    ar: `هل تريد عروضاً مناسبة من Datamine والشركات المشاركة؟ افتح Datamine لقراءة إشعار الخصوصية والموافقة مرة واحدة. لن تُحلل رسائلك حتى توافق.\n${link}`,
    ckb: `ئۆفەری گونجاوت دەوێت لە Datamine و کاروبارە بەشدارەکان؟ Datamine بکەرەوە بۆ خوێندنەوەی ئاگاداری تایبەتمەندی و ڕەزامەندی تەنها یەک جار. پەیامەکانت شیکاری ناکرێن تا ڕازی دەبیت.\n${link}`,
  };
  return copy[locale as keyof typeof copy] || copy.en;
}

export async function processConsentInvitations(limit = 2) {
  const db = getDb();
  await db
    .update(consentInvitations)
    .set({ status: 'uncertain' })
    .where(
      and(
        eq(consentInvitations.status, 'submitting'),
        lt(consentInvitations.startedAt, new Date(Date.now() - 90000)),
      ),
    );
  const due = await db
    .select()
    .from(consentInvitations)
    .where(eq(consentInvitations.status, 'queued'))
    .orderBy(consentInvitations.createdAt)
    .limit(limit);
  for (const item of due) {
    const [claimed] = await db
      .update(consentInvitations)
      .set({ status: 'submitting', startedAt: new Date() })
      .where(and(eq(consentInvitations.phone, item.phone), eq(consentInvitations.status, 'queued')))
      .returning();
    if (!claimed) continue;
    await db.transaction(async (tx) => {
      const [invitation] = await tx
        .select()
        .from(consentInvitations)
        .where(
          and(
            eq(consentInvitations.phone, item.phone),
            eq(consentInvitations.status, 'submitting'),
          ),
        )
        .for('update');
      if (!invitation) return;
      const [consent] = await tx
        .select()
        .from(customerConsents)
        .where(eq(customerConsents.phone, item.phone));
      const central = await centralConnection(tx);
      const [sender] = await tx
        .select()
        .from(connections)
        .where(eq(connections.id, item.connectionId));
      let status = 'cancelled';
      if (!consent && central && sender && replyWindowOpen(invitation.lastInboundAt)) {
        const result = await sendMetaText({
          phoneNumberId: sender.phoneNumberId,
          accessToken: decrypt(sender.accessTokenEncrypted, `${sender.id}:token`),
          to: item.phone,
          messageId: item.messageId,
          body: invitationCopy(central.displayPhone, item.locale),
        });
        status = result.status;
      }
      await tx
        .update(consentInvitations)
        .set({ status })
        .where(eq(consentInvitations.phone, item.phone));
    });
  }
  return due.length;
}
