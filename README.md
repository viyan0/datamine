# Datamine

A multilingual travel-agency demo built with Next.js, TypeScript, PostgreSQL, Drizzle, Better Auth, and next-intl. Phase 2 adds a simple agency inbox and customer records to the existing foundation.

## Available in the demo

- Staff login with closed public registration, database-backed rate limits, and password changes.
- Agency creation and explicit memberships. Even the platform owner needs an agency membership to read its private data.
- Administrator, agent, and viewer roles; single-use, 48-hour invitations. Invitations are copied and shared manually; the app does not send email.
- English, Arabic, and Sorani interfaces, including right-to-left layouts. Translations should receive native-speaker review before the live pilot.
- Meta account/phone verification, encrypted API credentials, signature verification, account-aware inbound routing, durable messages/events, and duplicate suppression.
- Incoming-message inspection for authorized staff, including explicit labels for unsupported media.
- An inbox at `/en/app/inbox` with agency selection, customer search, status filters, the latest 100 messages, and manual refresh.
- One customer/inquiry record per phone number per connected inbox: name, service, destination, New / In progress / Closed, and a private note. Incoming messages create records automatically, including backfilled Phase 1 messages.
- Text replies from the correct agency number, with accepted/sent/delivered/read/failed/uncertain states. Viewers cannot reply or edit records.
- An **interactive sample inbox** at `/en/demo/inbox`, `/ar/demo/inbox`, and `/ckb/demo/inbox`. Replies are simulated and edits reset on leaving the inbox; sample records never reach Meta or the database.
- An optional pg-boss worker for connection health. The inbox needs no worker or new infrastructure.

Haiku analysis, shared enrollment, and campaigns remain later phases. The planned model is **`claude-haiku-5-5`**. Delivery states come from Meta callbacks, never AI. Assignments, reminders, multiple trips per customer, media previews, templates, and automatic replies are deliberately outside this simple demo.

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
| `ANTHROPIC_MODEL` | `claude-haiku-5-5`, reserved for Phase 3 |

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

This exercises login, invitations, agency isolation, three locales, signed webhooks, customer edits, viewer restrictions, duplicate reply requests, expired reply windows, out-of-order delivery callbacks, uncertain-send reconciliation, and CSRF protection. All Meta sends are mocked. It creates test fixtures and **refuses to run against a remote deployment**. Production health is checked separately through `/api/health`.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for Render setup, verification, and the remaining provider setup. Infrastructure is described in `render.yaml`. The source project PDF is intentionally excluded from this public repository.

## Security boundaries

All agency APIs validate a Better Auth session and membership on the server. Client-side navigation is not an authorization boundary. Management operations additionally require owner/admin agency roles, and agency creation requires the platform administrator role. Credential ciphertext uses AES-256-GCM with the connection identifier as authenticated context. Neither tokens nor app secrets appear in workspace JSON, logs, or sample data.

Webhook signatures cover the unmodified request body. Each known phone number in a batch is checked against its stored app secret and WABA ID; one agency's payload is never stored as another agency's event. A successful callback response follows a committed database transaction. Database failures return a retryable response. Meta media files are not downloaded in this phase.

Invitations do not automatically verify email ownership: administrators must deliver the private link through a trusted channel. Existing accounts must sign in before accepting an invitation. Do not publish invitation URLs or bootstrap credentials.
