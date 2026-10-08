# Datamine · Phase 5 demo

A multilingual business demo built with Next.js, TypeScript, PostgreSQL, Drizzle, Better Auth, and next-intl. Phase 5 adds automatic AI insights and offer matching. Shops, salons, clinics, travel companies, and other businesses share the same simple inbox and customer workflow, with categories chosen from each conversation.

## Available in the demo

- Staff login with closed public registration, database-backed rate limits, and password changes.
- Business creation and explicit memberships. Even the platform owner needs a business membership to read its private data.
- A business type and up to 12 optional category hints, editable by owners/admins in Settings. Haiku chooses its own labels; changing context schedules fresh analysis. Hints can be written in any language.
- Administrator, agent, and viewer roles; single-use, 48-hour invitations. Invitations are copied and shared manually; the app does not send email.
- English, Arabic, and Sorani interfaces, including right-to-left layouts. Translations should receive native-speaker review before the live pilot.
- Meta account/phone verification, encrypted API credentials, signature verification, account-aware inbound routing, durable messages/events, and duplicate suppression.
- Incoming-message inspection for authorized staff, including explicit labels for unsupported media.
- An inbox at `/en/app/inbox` with business selection, customer search, status filters, the latest 100 messages, and automatic refresh.
- One customer/inquiry record per phone number per connected inbox: name, category, product/service/topic, New / In progress / Closed, and a private note. Incoming messages create records automatically, including backfilled Phase 1 messages.
- Text replies from the correct business number, with accepted/sent/delivered/read/failed/uncertain states. Viewers cannot reply or edit records.
- An **interactive sample inbox** at `/en/demo/inbox`, `/ar/demo/inbox`, and `/ckb/demo/inbox`. Replies are simulated and edits reset on leaving the inbox; sample records never reach Meta or the database.
- Automatic analysis and campaign processing use Vercel Queues when deployed on Vercel, or a companion process locally/on Render. An optional pg-boss worker handles connection health.

Offers now have automatic audience matching and simple approved-template delivery. Assignments, reminders, multiple inquiries per customer, media previews, and automatic replies remain outside this demo.

## Customer opt-in

The first incoming WhatsApp message queues one consent notice. A single explicit YES (also Arabic/Sorani equivalents) covers message collection, AI analysis and promotional enrollment. Silence stays pending: messages are held without AI analysis or promotional matching. NO deletes the held chat; STOP withdraws later. A minimal phone/choice record prevents further collection after withdrawal. Replayed webhooks cannot send duplicate notices or silently reverse a choice.

After YES, Haiku analyses the held messages, creates the shared customer profile and updates its interests automatically from its dynamic categories and subject. Existing unsent offers refresh their audience when those interests change. Consent applies once across connected businesses; no separate enrollment form is required. Raw conversations and staff notes remain private to the business. Offer matching uses consented interests and language, excluding names, phone numbers and raw chats from the AI request.

Inbox details show consent status. The existing verified customer portal remains an optional preferences route. Its opt-out removes the profile, chats and old access links. Neither the AI nor staff can infer an opt-in. Declines and natural-language promotional withdrawals remove saved data and prevent future collection; ambiguous sends are not blindly retried.

## Automatic AI analysis

New messages schedule analysis automatically; staff do not click an Analyze button. PostgreSQL stores pending jobs. On Vercel, a managed queue wakes a bounded processor and schedules retries only while work remains; a daily recovery job catches missed wakeups. Locally and on Render, a companion process starts with the app. Both call **anthropic/claude-haiku-5.5** through OpenRouter with reasoning disabled and [structured JSON output](https://openrouter.ai/docs/guides/features/structured-outputs). Routing requires support for the requested parameters and excludes providers that collect data. The same client handles conversation analysis and offer matching, with no fallback model or extra server.

Haiku chooses category and intent labels itself, along with the useful facts for that business and conversation. Business category hints are optional and do not constrain the output. The category, product/service/topic, and inquiry status update automatically. Extracted facts must identify an inbound source message and an exact supporting quote; the value must occur in that quote. Unknown facts are omitted. Names and private notes are never overwritten. Manual category/topic/status corrections are retained until staff restore automatic details.

Analysis includes at most 30 recent text messages, 16,000 characters total, and 3,000 per message. Connection secrets, contact metadata, and private notes are excluded; customer text itself is sent through OpenRouter to Claude. Saved results include source IDs, model/schema version, timing, and token usage. Source hashes, revision checks, and 90-second leases prevent duplicate or stale work. Errors preserve prior results and retry with backoff; media-only conversations wait for text. The inbox polls for updates every four seconds while visible.

Set OPENROUTER_API_KEY to enable live analysis. Without it, the interface shows setup guidance. Public demo insights are prepared fixtures displayed automatically; they do not analyze arbitrary added sample replies or prove model accuracy.

## Offers and campaigns

Open **Campaigns** to submit an offer for any business. Haiku automatically classifies the offer and matches customers using consented AI-derived interests and product/service/topic. Names, phone numbers, private conversations, and staff notes are excluded from matching requests. Only active, unheld profiles with the offer's language are eligible; this demo supports up to 100 per language. Datamine administrators see the audience and match reasons; ordinary business staff see only their own offers and status.

The platform administrator chooses a central Datamine WhatsApp sender and an approved marketing template. The demo lists static body/footer templates, without variables, buttons, or media, from the first 100 returned by Meta. The template must use the offer's language (or its regional variant). Selecting it automatically rematches the exact text customers will receive. An explicit **Send approved offer** action starts delivery; classification never sends messages on its own.

Each recipient has a durable claim and tracked message. The sender's current template approval, enrollment, opt-out/hold state, language, and profile revision are checked again. Changed preferences require fresh matching; cancellation stops queued recipients. Uncertain sends are not automatically retried. Provider callbacks supply delivery status without regressing read/delivered receipts.

Incoming messages from enrolled customers put offers on hold until automatic analysis checks them for opt-out. Explicit STOP/unsubscribe commands suppress immediately, including when AI is unavailable. Haiku can suppress promotional messages but cannot grant consent or undo an opt-out. Customers can also opt out through their verified preferences page.

The public Campaigns demo contains a prepared furniture offer and simulated delivery. New sample drafts are temporary and explicitly require a real AI connection for new matching.

Replies are saved before a direct Meta request. A unique request ID prevents repeated submissions; a lost response is marked uncertain and is not retried automatically. Signed callbacks can reconcile it, and delayed events cannot move read/delivered messages backward. Text replies require a customer message within the last 24 hours, following [WhatsApp's messaging policy](https://business.whatsapp.com/policy). Outside that window, this demo waits for another customer message.

## Local development

Use Node.js 24 and npm. Install dependencies with `npm ci`. Copy `.env.example` to `.env.local` and provide a PostgreSQL connection plus the configuration below. No secrets belong in Git.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; Neon pooled URL on Vercel, internal URL on Render |
| `BETTER_AUTH_URL` | Canonical app URL; defaults to the hosting provider's URL |
| `BETTER_AUTH_SECRET` | Random secret, at least 32 characters |
| `CREDENTIAL_ENCRYPTION_KEY` | 32 random bytes encoded as 64 hexadecimal characters |
| `WHATSAPP_VERIFY_TOKEN` | Random verification secret, at least 32 characters |
| `BOOTSTRAP_ADMIN_EMAIL` | Initial workspace owner's email |
| `BOOTSTRAP_ADMIN_PASSWORD` | Strong initial password; at least 12 characters |
| `BOOTSTRAP_ADMIN_NAME` | Initial owner's display name |
| `META_GRAPH_VERSION` | Supported Meta Graph version, default `v23.0` |
| `OPENROUTER_MODEL` | `anthropic/claude-haiku-5.5`; other model values disable analysis |
| `OPENROUTER_API_KEY` | Server-only OpenRouter key with credits and access to Haiku 5.5; optional for the sample demo |
| `CRON_SECRET` | Random secret for Vercel's daily job recovery and authenticated queue wakeups |

Generate secrets locally with Node's `crypto.randomBytes(32).toString('hex')`. Store them in your environment or password manager.

```sh
node --env-file=.env.local --import tsx scripts/migrate.ts
node --env-file=.env.local --import tsx scripts/bootstrap.ts
npm run dev
```

The bootstrap creates one Datamine agency and one owner **only when no users exist**. It never resets an existing account's password. Change the initial password in Settings and remove the bootstrap password from the deployment environment afterward.

For local testing without a PostgreSQL installation, run `npx tsx scripts/local-db.ts` in a separate terminal. This launches PGlite's PostgreSQL-compatible socket on **127.0.0.1:54329** and stores local data under ignored `.local/`. Use `postgresql://postgres:postgres@127.0.0.1:54329/postgres`. PGlite is development tooling, not the production database.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

With the locally built app running against the isolated local socket database and AUTOMATION_DISABLED=true on the app process (to isolate provider mocks), run:

```sh
node --env-file=.env.local --import tsx scripts/smoke.ts
node --env-file=.env.local --import tsx scripts/smoke-phase5.ts
```

This exercises login, invitations, business isolation/settings, three locales, signed webhooks, inbox edits, delivery safeguards, AI persistence/cache/evidence, verification expiry/replay/throttling, explicit consent, shared profile deduplication, opt-out, and private-data boundaries. The Phase 5 suite additionally checks automatic processing, retries/recovery, manual overrides, dynamic labels, campaign privacy, exact-template matching, consent changes, deduplicated delivery, uncertain outcomes, and opt-outs. Meta and OpenRouter requests are mocked. The suites create test fixtures and **refuse to run against a remote deployment**. Production health is checked separately through `/api/health`.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel + Neon setup, the Render alternative, and provider verification. Vercel configuration is in `vercel.ts`; Render infrastructure is in `render.yaml`. The source project PDF and local credentials are excluded from both Git and Vercel uploads.

## Security boundaries

All agency APIs validate a Better Auth session and membership on the server. Client-side navigation is not an authorization boundary. Management operations additionally require owner/admin agency roles, and agency creation requires the platform administrator role. Credential ciphertext uses AES-256-GCM with the connection identifier as authenticated context. Neither tokens nor app secrets appear in workspace JSON, logs, or sample data.

Webhook signatures cover the unmodified request body. Each known phone number in a batch is checked against its stored app secret and WABA ID; one agency's payload is never stored as another agency's event. A successful callback response follows a committed database transaction. Database failures return a retryable response. Meta media files are not downloaded in this phase.

Invitations do not automatically verify email ownership: administrators must deliver the private link through a trusted channel. Existing accounts must sign in before accepting an invitation. Do not publish invitation URLs or bootstrap credentials.
