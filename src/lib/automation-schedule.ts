// PostgreSQL remains the source of truth. Queue messages only wake the processor.
// Respect active 90-second claims rather than repeatedly waking a busy job.
export const automationDueSql = `
  select min(due_at) as due_at from (
    select greatest(analysis_due_at, case when analysis_run_id is not null
      then analysis_started_at + interval '91 seconds' else analysis_due_at end) as due_at
    from conversations where $1 and analysis_due_at is not null and exists (select 1 from customer_consents cc where cc.phone=conversations.contact_phone and cc.status='accepted')
    union all
    select case when reply_status='queued' then now() else reply_started_at + interval '91 seconds' end
    from customer_consents where reply_status in ('queued','submitting')
    union all
    select greatest(due_at, case when run_id is not null
      then started_at + interval '91 seconds' else due_at end)
    from campaigns where $1 and status in ('matching', 'error') and due_at is not null
    union all
    select case when status = 'queued' then now() else submitted_at + interval '91 seconds' end
    from campaign_recipients where status in ('queued', 'submitting')
    union all
    select created_at + interval '91 seconds' from messages
    where delivery_status = 'submitting' and (type = 'template' or exists (
      select 1 from campaign_recipients r where r.id = messages.request_id
    ))
    union all
    select now() from campaigns c where status = 'sending' and not exists (
      select 1 from campaign_recipients r where r.campaign_id = c.id
      and r.status in ('queued', 'submitting')
    )
  ) pending`;

export function automationDelay(due: Date | string | null, now = Date.now()) {
  if (!due) return null;
  return Math.max(2, Math.min(900, Math.ceil((new Date(due).getTime() - now) / 1000)));
}
