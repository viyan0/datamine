# Datamine demo

A multilingual business demo built with Next.js, TypeScript, PostgreSQL, Drizzle, Better Auth, and next-intl. It combines business CRM, consented customer insights, manual campaigns, and automatic offer recommendations. Shops, salons, clinics, travel companies, and other businesses share the same simple inbox and customer workflow, with categories chosen from each conversation.

## Available in the demo

- Staff login with closed public registration, database-backed rate limits, and password changes.
- One central administrator can view and manage every business, its inboxes, customers, and offers. Business accounts see only their own CRM data.
- A business type and up to 12 optional category hints, editable by owners/admins in Settings. Haiku chooses its own labels; changing context schedules fresh analysis. Hints can be written in any language.
- Business owners are invited from **Businesses** with single-use, 48-hour links. There is no Team sidebar. Invitations are copied and shared manually; the app does not send email.
- English, Arabic, and Sorani interfaces, including right-to-left layouts. Translations should receive native-speaker review before the live pilot.
- Meta account/phone verification, encrypted API credentials, signature verification, account-aware inbound routing, durable messages/events, and duplicate suppression.
- Incoming-message inspection for authorized staff, including explicit labels for unsupported media.
- An inbox at `/en/app/inbox` with business selection, customer search, status filters, the latest 100 messages, and automatic refresh.
- One customer/inquiry record per phone number per connected inbox: name, category, product/service/topic, New / In progress / Closed, and a private note. Incoming messages create records automatically, including backfilled Phase 1 messages.
- Text replies from the correct business number, with accepted/sent/delivered/read/failed/uncertain states. Viewers cannot reply or edit records.
- An **interactive sample inbox** at `/en/demo/inbox`, `/ar/demo/inbox`, and `/ckb/demo/inbox`. Replies are simulated and edits reset on leaving the inbox; sample records never reach Meta or the database.
- Automatic analysis and campaign processing use Vercel Queues when deployed on Vercel, or a companion process locally/on Render. An optional pg-boss worker handles connection health.

Manual bulk campaigns and automatic recommendations are separate flows. Assignments, reminders, multiple inquiries per customer, media previews, and general customer-service chatbots remain outside this demo.

## Customer opt-in

The first incoming WhatsApp message queues one consent notice. A single explicit YES (also Arabic/Sorani equivalents) covers message collection, AI analysis and promotional enrollment. Silence stays pending: messages are held without AI analysis or promotional matching. NO deletes the held chat; STOP withdraws later. A minimal phone/choice record prevents further collection after withdrawal. Replayed webhooks cannot send duplicate notices or silently reverse a choice.

After YES, Haiku analyses the held messages, creates the shared customer profile and updates its interests automatically from its dynamic categories and subject. Existing unsent offers refresh their audience when those interests change. Consent applies once across connected businesses; no separate enrollment form is required. Business accounts can view their own customer contacts and interests extracted from their own chats. Other businesses cannot browse those contacts, conversations, or notes. The central administrator can view all businesses. The recommendation service uses consented interests to find suitable published offers across businesses.

Inbox details show consent status. The existing verified customer portal remains an optional preferences route. Its opt-out removes the profile, chats and old access links. Neither the AI nor staff can infer an opt-in. Global withdrawals remove saved data and prevent future collection. Topic-specific stops only suppress that topic. Ambiguous sends are not blindly retried.

## Automatic AI analysis

New messages schedule analysis automatically; staff do not click an Analyze button. PostgreSQL stores pending jobs. On Vercel, a managed queue wakes a bounded processor and schedules retries only while work remains; a daily recovery job catches missed wakeups. Locally and on Render, a companion process starts with the app. Both call **anthropic/claude-haiku-5.5** through OpenRouter with reasoning disabled and [structured JSON output](https://openrouter.ai/docs/guides/features/structured-outputs). Routing requires support for the requested parameters and excludes providers that collect data. The same client handles conversation analysis and offer matching, with no fallback model or extra server.

Haiku chooses category and intent labels itself, along with the useful facts for that business and conversation. Business category hints are optional and do not constrain the output. The category, product/service/topic, and inquiry status update automatically. Extracted facts must identify an inbound source message and an exact supporting quote; the value must occur in that quote. Unknown facts are omitted. Names and private notes are never overwritten. Manual category/topic/status corrections are retained until staff restore automatic details.

Analysis includes at most 30 recent text messages, 16,000 characters total, and 3,000 per message. Connection secrets, contact metadata, and private notes are excluded; customer text itself is sent through OpenRouter to Claude. Saved results include source IDs, model/schema version, timing, and token usage. Source hashes, revision checks, and 90-second leases prevent duplicate or stale work. Errors preserve prior results and retry with backoff; media-only conversations wait for text. The inbox polls for updates every four seconds while visible.

Set OPENROUTER_API_KEY to enable live analysis. Without it, the interface shows setup guidance. Public demo insights are prepared fixtures displayed automatically; they do not analyze arbitrary added sample replies or prove model accuracy.

## Offers and campaigns

Business owners/admins open **Campaigns** to create and send their own bulk offers. Haiku chooses the offer categories and matches only that business's consented customers, using interests and topics from its own chats. Active profiles, accepted consent, language, and topic preferences gate eligibility. This demo supports up to 100 eligible customers per campaign. Owners/admins can review their own customer contacts and match reasons; the central administrator can manage every campaign.

Each campaign uses its business's connected WhatsApp sender. **Create template with AI** drafts plain text from the offer, which staff can edit and submit to Meta inside Datamine. The selector shows approved, pending, and rejected templates. It supports static body/footer text from the first 100 templates returned by Meta, without variables, buttons, or media. Selecting a template rematches the exact message. Template delivery requires current Meta approval.

For matched customers with an open 24-hour chat window on that same sender, **Send now on WhatsApp** sends the preview as a real text reply. Closed windows are skipped. A pending template is not treated as approved, and no messaging window is bypassed. Manual bulk sends still require the business to click Send; the one-offer limit below applies only to automatic recommendations.

Consent, topic preferences, profile revisions, sender ownership, and the reply window are checked again before delivery. Durable claims prevent duplicate submissions. STOP and deletion are serialized with actual submission; queued messages are cancelled, while a message already submitted cannot be recalled. Uncertain provider outcomes are never automatically resent.

## Automatic recommendations

A business explicitly enables **Recommend across Datamine** for an offer and sets **Available until**. Existing offers stay unpublished until enabled. Availability must be in the future and no more than 90 days away; offers can be unpublished at any time.

After at least two genuine inbound requests about the same topic, AI compares relevant, available offers from other participating businesses. It selects at most one clear match using the stated needs, budget, location, and offer details. It sends nothing if the supplied offers do not fit. "Best" means the best suitable candidate supplied to the model, not a claim about the whole market.

One automatic offer is sent, then that topic waits. Only an explicit **MORE** or equivalent request can send one further unseen offer. Another ordinary product question does not request more. Categories and topics come from AI rather than a fixed list.

- **STOP OFFER** stops the latest offer's topic. Customers can also name a topic to stop. Other topics remain available, and MORE does not undo a topic stop.
- **STOP**, **STOP ALL**, or **DELETE MY DATA** withdraws from the whole service and removes saved chats, customer profiles, recommendation records, and queued offers. A minimal consent-choice record prevents new collection. A later explicit YES can rejoin.

Recommendations reply through the originating business number the customer contacted. They are sent only while that number's 24-hour customer-service window is open. An expired window waits for a fresh customer message. Supplier contact details appear in the offer; the supplier does not receive access to the customer's CRM record. This flow does not bypass Meta template approval or messaging limits.

The public demo uses temporary fixtures and simulated delivery. Automated integration tests mock Meta and OpenRouter. The optional live-AI smoke below uses real Haiku with synthetic customer requests; Meta delivery remains mocked.

## Local development

Use Node.js 24 and npm. Install dependencies with `npm ci`. Copy `.env.example` to `.env.local` and provide a PostgreSQL connection plus the configuration below. No secrets belong in Git.

| Variable                    | Purpose                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | PostgreSQL connection string; Neon pooled URL on Vercel, internal URL on Render               |
| `BETTER_AUTH_URL`           | Canonical app URL; defaults to the hosting provider's URL                                     |
| `BETTER_AUTH_SECRET`        | Random secret, at least 32 characters                                                         |
| `CREDENTIAL_ENCRYPTION_KEY` | 32 random bytes encoded as 64 hexadecimal characters                                          |
| `WHATSAPP_VERIFY_TOKEN`     | Random verification secret, at least 32 characters                                            |
| `BOOTSTRAP_ADMIN_EMAIL`     | Initial workspace owner's email                                                               |
| `BOOTSTRAP_ADMIN_PASSWORD`  | Strong initial password; at least 12 characters                                               |
| `BOOTSTRAP_ADMIN_NAME`      | Initial owner's display name                                                                  |
| `META_GRAPH_VERSION`        | Supported Meta Graph version, default `v23.0`                                                 |
| `OPENROUTER_MODEL`          | `anthropic/claude-haiku-5.5`; other model values disable analysis                             |
| `OPENROUTER_API_KEY`        | Server-only OpenRouter key with credits and access to Haiku 5.5; optional for the sample demo |
| `CRON_SECRET`               | Random secret for Vercel's daily job recovery and authenticated queue wakeups                 |

Generate secrets locally with Node's `crypto.randomBytes(32).toString('hex')`. Store them in your environment or password manager.

```sh
node --env-file=.env.local --import tsx scripts/migrate.ts
node --env-file=.env.local --import tsx scripts/bootstrap.ts
npm run dev
```

Migrations include `0009_smart_offer_flow.sql`, which adds topic preferences, explicit network availability, and durable recommendation jobs. Existing offers default to unpublished.

The bootstrap creates one Datamine agency and one central owner **only when no users exist**. It never resets an existing account's password. Change the initial password in Settings and remove the bootstrap password from the deployment environment afterward.

For local testing without a PostgreSQL installation, run `npx tsx scripts/local-db.ts` in a separate terminal. This launches PGlite's PostgreSQL-compatible socket on **127.0.0.1:54329** and stores local data under ignored `.local/`. Use `postgresql://postgres:postgres@127.0.0.1:54329/postgres`. PGlite is development tooling, not the production database.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The integration suites use isolated PGlite databases and mock external providers. Target the new flow with:

```sh
node --import tsx --test tests/access.test.ts tests/business-http.test.ts tests/campaign-replies.test.ts tests/recommendations.test.ts
```

These cover central administration, owner invitations, business isolation, scoped audiences, consent, publication expiry, repeated interest, one offer then MORE, topic stops, global deletion, sender windows, and duplicate/uncertain delivery. No test fixtures should be created in production. Check `/api/health` separately and perform an authorized, controlled WhatsApp acceptance test before presenting the new flow.

For an optional real-model check, set `OPENROUTER_API_KEY` in the current process, then run:

```sh
node --import tsx scripts/smoke-smart-offers.ts --live-ai
```

This spends OpenRouter credits, creates a disposable PGlite database on port 54339, and mocks every Meta message. It checks consent, repeated interest, the better-priced matching offer from another business, MORE, topic stops, a different interest, and complete withdrawal. It never uses the application's database or sends a real WhatsApp message. The completed smoke used `anthropic/claude-haiku-5.5`; live WhatsApp delivery requires a separate controlled check.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel + Neon setup, the Render alternative, and provider verification. Vercel configuration is in `vercel.ts`; Render infrastructure is in `render.yaml`. The source project PDF and local credentials are excluded from both Git and Vercel uploads.

## Security boundaries

All agency APIs validate a Better Auth session on the server. Business users require membership, with owner/admin roles for management. The central platform administrator can access all businesses without separate memberships. Client-side navigation is not an authorization boundary, and only the platform administrator can create businesses. Credential ciphertext uses AES-256-GCM with the connection identifier as authenticated context. Neither tokens nor app secrets appear in workspace JSON, logs, or sample data.

Webhook signatures cover the unmodified request body. Each known phone number in a batch is checked against its stored app secret and WABA ID; one agency's payload is never stored as another agency's event. A successful callback response follows a committed database transaction. Database failures return a retryable response. Meta media files are not downloaded in this phase.

Invitations do not automatically verify email ownership: administrators must deliver the private link through a trusted channel. Existing accounts must sign in before accepting an invitation. Do not publish invitation URLs or bootstrap credentials.
