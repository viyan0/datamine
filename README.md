# Datamine

A multilingual business demo built with Next.js, TypeScript, PostgreSQL, Drizzle, Better Auth, and next-intl. Phase 4 adds customer opt-in and a central customer network. Shops, salons, clinics, travel companies, and other businesses share the same simple inbox and customer workflow, with their own categories.

## Available in the demo

- Staff login with closed public registration, database-backed rate limits, and password changes.
- Business creation and explicit memberships. Even the platform owner needs a business membership to read its private data.
- A business type and up to 12 custom inquiry categories, editable by owners/admins in Settings. Haiku uses that business's categories; changing them invalidates saved analysis. Categories can be written in any language.
- Administrator, agent, and viewer roles; single-use, 48-hour invitations. Invitations are copied and shared manually; the app does not send email.
- English, Arabic, and Sorani interfaces, including right-to-left layouts. Translations should receive native-speaker review before the live pilot.
- Meta account/phone verification, encrypted API credentials, signature verification, account-aware inbound routing, durable messages/events, and duplicate suppression.
- Incoming-message inspection for authorized staff, including explicit labels for unsupported media.
- An inbox at `/en/app/inbox` with business selection, customer search, status filters, the latest 100 messages, and manual refresh.
- One customer/inquiry record per phone number per connected inbox: name, category, product/service/topic, New / In progress / Closed, and a private note. Incoming messages create records automatically, including backfilled Phase 1 messages.
- Text replies from the correct business number, with accepted/sent/delivered/read/failed/uncertain states. Viewers cannot reply or edit records.
- An **interactive sample inbox** at `/en/demo/inbox`, `/ar/demo/inbox`, and `/ckb/demo/inbox`. Replies are simulated and edits reset on leaving the inbox; sample records never reach Meta or the database.
- An optional pg-boss worker for connection health. The inbox needs no worker or new infrastructure.

Campaigns remain a later phase. Delivery states come from Meta callbacks, never AI. Assignments, reminders, multiple inquiries per customer, media previews, templates, and automatic replies are deliberately outside this simple demo.

## Customer opt-in

From an inbox's customer details, staff create a private opt-in link and share it manually. The customer opens `/en/enroll#<token>`, requests a six-digit WhatsApp code, and verifies the number already associated with the conversation. Codes use the business's existing Meta connection and require a customer message within the 24-hour reply window. They are excluded from staff message history and API responses.

Verification alone does **not** enroll anyone. The customer enters their own name, language, interests, and optional product/service/topic, then checks an initially unchecked consent box to join Datamine and receive relevant WhatsApp offers. Consent is recorded with its notice version, locale, channel, and timestamp. No private conversation, staff note, or AI-inferred preference is copied into this profile.

The central list at `/en/app/customers` is restricted to Datamine platform administrators. A phone number has one shared profile across businesses. Verified customers can update their own preferences, opt out, or explicitly join again. Preference changes never undo an opt-out. Opted-out records remain as suppression records; no campaigns or automated offers are sent by this phase.

Links expire after 24 hours; a conversation can create one per hour. Codes expire after 10 minutes, permit five incorrect attempts and three sends per link, and have a one-minute resend cooldown. Codes and link/session tokens are hashed; successful verification consumes the code and creates a 30-minute HttpOnly customer session. After it expires, the customer requests a fresh link and verifies again. No new SMS provider or worker is needed.

Try the simulated flow at `/en/enroll/demo` (also `/ar` and `/ckb`) with code **123456**, then visit `/en/demo/customers`. Sample preferences stay in that browser tab's session storage; they never reach the database or Meta. Sample businesses include travel, home furnishings, and a salon.

Existing database/API names such as `agencies`, `service`, and `destination` are retained for compatibility. Their user-facing meanings are business, category, and product/service/topic; there is no travel-only validation.

## Simple AI analysis

Open a conversation and click **Analyze conversation**. A single server-side Anthropic Messages request uses **`claude-haiku-5-5`**, low effort, disabled thinking, and [structured JSON output](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). There is no fallback model, tool use, automatic reply, or extra worker.

The card shows the business's category labels, request type, customer language, a short summary, requested product/service, location, date as stated, quantity, budget, and a suggested next step. Unknown facts stay null. Extracted facts must reference an inbound message with a matching quote. Results are suggestions and never overwrite staff-entered customer details, notes, or inquiry status. Older travel-only analysis is hidden until refreshed with the new schema.

Only up to 30 recent text messages are analyzed, capped at 16,000 characters total and 3,000 per message. Connection secrets, contact metadata, and private notes are excluded; text typed in messages is sent to Anthropic. Results, source IDs, model/schema version, timing, and token usage are saved in PostgreSQL. Unchanged input reuses the saved result. A short database lease prevents concurrent requests; changed source text invalidates in-flight results. Failures preserve the previous analysis and leave the inbox usable.

Set `ANTHROPIC_API_KEY` on the server to enable real analysis. Without it, a setup message appears. Public sample inboxes offer **Try sample analysis**, which displays prepared localized examples without calling Anthropic. These fixtures do not analyze added demo replies and do not demonstrate measured model accuracy.

Replies are saved before a direct Meta request. A unique request ID prevents repeated submissions; a lost response is marked uncertain and is not retried automatically. Signed callbacks can reconcile it, and delayed events cannot move read/delivered messages backward. Text replies require a customer message within the last 24 hours, following [WhatsApp's messaging policy](https://business.whatsapp.com/policy). Outside that window, this demo waits for another customer message.

## Local development

Use Node.js 24 and npm. Install dependencies with `npm ci`. Copy `.env.example` to `.env.local` and provide a PostgreSQL connection plus the configuration below. No secrets belong in Git.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string; use Render's internal URL on Render |
| `BETTER_AUTH_URL` | Canonical app URL; Render's `RENDER_EXTERNAL_URL` is the fallback |
| `BETTER_AUTH_SECRET` | Random secret, at least 32 characters |
| `CREDENTIAL_ENCRYPTION_KEY` | 32 random bytes encoded as 64 hexadecimal characters |
| `WHATSAPP_VERIFY_TOKEN` | Random verification secret, at least 32 characters |
| `BOOTSTRAP_ADMIN_EMAIL` | Initial workspace owner's email |
| `BOOTSTRAP_ADMIN_PASSWORD` | Strong initial password; at least 12 characters |
| `BOOTSTRAP_ADMIN_NAME` | Initial owner's display name |
| `META_GRAPH_VERSION` | Supported Meta Graph version, default `v23.0` |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5`; other model values disable analysis |
| `ANTHROPIC_API_KEY` | Server-only Anthropic key with access to Haiku 5.5; optional for the sample demo |

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

With the locally built app running against the isolated local socket database, run:

```sh
node --env-file=.env.local --import tsx scripts/smoke.ts
```

This exercises login, invitations, business isolation/settings, three locales, signed webhooks, inbox edits, delivery safeguards, AI persistence/cache/evidence, verification expiry/replay/throttling, explicit consent, shared profile deduplication, opt-out, and private-data boundaries. Meta and Anthropic requests are mocked. It creates test fixtures and **refuses to run against a remote deployment**. Production health is checked separately through `/api/health`.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Render setup, verification, and the remaining provider setup. Infrastructure is described in `render.yaml`. The source project PDF is intentionally excluded from this public repository.

## Security boundaries

All agency APIs validate a Better Auth session and membership on the server. Client-side navigation is not an authorization boundary. Management operations additionally require owner/admin agency roles, and agency creation requires the platform administrator role. Credential ciphertext uses AES-256-GCM with the connection identifier as authenticated context. Neither tokens nor app secrets appear in workspace JSON, logs, or sample data.

Webhook signatures cover the unmodified request body. Each known phone number in a batch is checked against its stored app secret and WABA ID; one agency's payload is never stored as another agency's event. A successful callback response follows a committed database transaction. Database failures return a retryable response. Meta media files are not downloaded in this phase.

Invitations do not automatically verify email ownership: administrators must deliver the private link through a trusted channel. Existing accounts must sign in before accepting an invitation. Do not publish invitation URLs or bootstrap credentials.
