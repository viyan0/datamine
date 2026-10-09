# Deployment

## Vercel (current demo host)

The linked project is **viki-0760/datamine**, with Neon Free PostgreSQL **datamine-db** in Frankfurt. `vercel.ts` selects Next.js, the Frankfurt function region, a queue consumer, and a daily recovery job. Vercel runs Next.js directly; it does not run the local `npm start` companion loop.

1. Connect a Neon PostgreSQL resource to **Production**. Use its pooled `DATABASE_URL` for the app. Keep `.env.local` for local development; pull cloud variables into an ignored file with `vercel env pull .local/production.env --environment=production`.
2. Configure production `BETTER_AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY` (64 hex characters), `WHATSAPP_VERIFY_TOKEN`, `CRON_SECRET`, `OPENROUTER_MODEL=anthropic/claude-haiku-5.5`, `OPENROUTER_API_KEY`, and `META_GRAPH_VERSION=v26.0`. Secrets must stay server-side. The app derives its production URL from Vercel; a custom canonical domain can use `BETTER_AUTH_URL`.
3. Before deploying a schema change, run `scripts/migrate.ts` with the intended database's **unpooled** URL. This release requires `0009_smart_offer_flow.sql` for topic preferences, explicit offer publication/expiry, and durable recommendation jobs. Existing offers remain unpublished by default. Run `scripts/bootstrap.ts` once with an owner email and a strong temporary password. These commands are deliberately separate from preview builds. Never point the local smoke suites at this database.
4. Run the checks, commit and push, then `vercel deploy --prod --scope viki-0760`. The current GitHub integration could not be connected, so pushes alone do not deploy. The CLI publishes the checked local source; `.vercelignore` excludes local secrets and test data.
5. Verify `/api/health`, the three language routes, sign-in, and authenticated business APIs. Keep preview deployment protection enabled. Change the temporary owner password through Settings after delivery.

Incoming webhooks, replies, business edits, and campaign actions publish a small queue wakeup. PostgreSQL still owns the jobs, leases, retry delays, and send claims. A bounded Vercel Function processes work, schedules another wake only when needed, and stops when idle. A secret-protected daily job recovers saved work after a missed queue publish. Webhooks return a retryable error if the wakeup fails; already-sent replies are still reported accurately. Manual bulk campaigns require the business to click Send. Automatic recommendations are separate: repeated interest can send one suitable published offer, followed by one more only on an explicit customer request.

Neon and production secrets are configured. Confirm migrations through 0011 have run before serving this release. Record the deployed revision and controlled live test results in `DELIVERY.md`; automated checks alone do not verify the new flow with real providers.

## Render alternative

The intended workspace is **Viyan's workspace** (`tea-d20g506mcj7s73b50i10`), using the repository `https://github.com/viyan0/datamine` and the `main` branch. App and database belong in Frankfurt so the app can use the private database connection.

## Foundation deployment

`render.yaml` describes a Next.js web service and PostgreSQL 17 database on free demo plans. Deploy the Blueprint at:

https://dashboard.render.com/blueprint/new?repo=https://github.com/viyan0/datamine

The same two resources can be created through Render's API/MCP, using the build/start commands and environment variables in the Blueprint. Do not apply a second Blueprint on top of separately provisioned resources without first checking for duplicates.

1. Ensure this repository is accessible to Render and the account's billing setup is complete if Render requests it.
2. Set `CREDENTIAL_ENCRYPTION_KEY`, bootstrap email, a strong bootstrap password, and `OPENROUTER_API_KEY`. The Blueprint generates authentication and webhook verification secrets. The app uses Render's `RENDER_EXTERNAL_URL` for its public URL; do not set `BETTER_AUTH_URL` to localhost on the hosted service.
3. Use the database's **internal** connection string. The Blueprint restricts external database access; it does not affect private networking.
4. Build with `npm ci --include=dev && npm run build`. Start with `npm start`.
5. Startup applies versioned Drizzle migrations, bootstraps the first owner if needed, starts the companion automation loop, and binds Next.js to `0.0.0.0:$PORT`. Startup fails on migration errors rather than serving a partially initialized app.
6. Wait for Render's deploy status to become `live`, then check `/api/health` for HTTP 200 and `database: connected`.
7. Verify `/en`, `/ar`, `/ckb` and the sample tour. Sign in with the bootstrap account, create a business, and test an invitation. Change the initial password and remove the bootstrap password environment variable.

Render currently requires billing information for this account: the initial free PostgreSQL creation attempt returned **HTTP 402**. No database was created by that failed attempt. Deployment status and final URLs are tracked in `DELIVERY.md`.

Render's free web service can sleep after inactivity, and free PostgreSQL expires after 30 days. This configuration is for a demonstration. A real WhatsApp pilot requires an always-on web service and a paid database with appropriate backup retention. See https://render.com/docs/free for current limitations.

## Optional background worker

Phase 1 inbound ingestion commits synchronously; it does not depend on a worker or an AI API key. A separately deployable pg-boss worker is included for periodic WhatsApp credential health checks:

- Runtime: Node 24, region: Frankfurt.
- Build: `npm ci --include=dev`.
- Start: `npm run worker`.
- Environment: the same `DATABASE_URL`, `CREDENTIAL_ENCRYPTION_KEY`, and `META_GRAPH_VERSION` as the web service.
- Ensure migrations have completed before starting the worker.
- Allow 30 seconds for graceful SIGTERM shutdown.

Render background workers require a paid plan, so the free demo Blueprint does not provision one. Failed health-check jobs retry with backoff and remain in pg-boss for inspection. Automatic AI analysis and campaigns use the companion process started by npm start, not this optional health worker. Jobs persist in PostgreSQL. SIGTERM stops new work; abandoned claims recover after 90 seconds. The free web service processes work only while awake; an always-on instance is needed for prompt background processing.

## Connect the central Datamine number

For this demo, use the existing **leadstest** Meta app (`1088621117427847`) in the **Leadstest** business portfolio, as selected by the owner. Replace its previous project's callback with the deployed Datamine `/api/webhooks/whatsapp` endpoint once the public service is healthy and the connection credentials are configured. Meta currently shows the `messages` subscription at Graph API v26.0; confirm the version and set `META_GRAPH_VERSION` when connecting. The test sender is **+1 (555) 632-3113**, phone ID `1328135173721537`, WABA ID `2248867165684591`. Use a verified recipient controlled by the owner. Temporary test tokens expire and must be refreshed before subsequent demos. Changing the callback disconnects incoming events from the old project; deleting that project's app, data, or hosting resources is not required.

1. As central administrator, create each business with its type and optional category hints. Invite its owner from **Businesses**, then share the private invitation link through a trusted channel. There is no Team sidebar. Validate that the business account cannot access another business's CRM or campaigns, while the central administrator can view all businesses.
2. The central administrator opens **WhatsApp → Connect number** and supplies the Datamine Meta phone number ID, WABA ID, system-user token, and app secret. The server checks the phone belongs to the WABA before encrypting the credentials. Select **Use this number** in the Datamine WhatsApp card. Only one verified connection can be the central sender; no business-number fallback is used.
3. The workspace owner copies the callback URL and verification token from the connections page. Configure the callback in Meta and subscribe to the `messages` field for the appropriate app/WABA. Existing integrations may already use that callback; review or arrange event forwarding before replacing it.
4. Send a controlled test text to the central number. The connection changes from **Credentials verified** to **Receiving events** only after a valid, signed callback. Consent and customer conversations belong to the central workspace. Businesses only need website accounts to publish offers; inbound messages to other configured numbers are not collected in this mode.
5. Replay a webhook and confirm the stored message count does not increase.

Provider verification and webhook processing are covered by mocked automated tests. The deployed test sender, live webhook, and a real incoming/outgoing WhatsApp conversation have also been verified; see DELIVERY.md for current live results and remaining pilot checks. All offers use the central sender and identify the seller. Manual campaigns support static approved marketing templates, or text replies inside the central number's open 24-hour window. Automatic recommendation acceptance is a separate check below.

## Enable conversation analysis

Add `OPENROUTER_API_KEY` to the web service environment and retain `OPENROUTER_MODEL=anthropic/claude-haiku-5.5`. Do not prefix the key with `NEXT_PUBLIC_` or add it to Git. Redeploy or restart after setting the key. The existing start command launches the automation process alongside the web app; no additional hosted service is needed. The sample preview works without this key.

Once configured, send a controlled incoming text and wait for automatic analysis. Check categories, dynamic fact labels, extracted quotes, summary language, and missing details. Repeat with different business types in English, Arabic, and Sorani. Confirm results survive reload, new messages update them, and manual corrections and staff notes are preserved. There is no analysis button. Automated checks mock OpenRouter; see DELIVERY.md for live verification results. OpenRouter credentials with no remaining credits leave analysis pending with setup guidance.

## Verify the complete customer flow

Run the isolated checks before deploying:

```sh
npm run lint
npm run typecheck
npm test
npm run build
node --import tsx --test tests/access.test.ts tests/campaign-replies.test.ts tests/recommendations.test.ts
```

The targeted suites mock Meta and OpenRouter. They cover role boundaries, own-business audiences and sender selection, repeated-interest recommendations, MORE, topic stops, deletion, expiry, and duplicate/uncertain delivery. They are not evidence that the new flow has been verified against real providers.

For controlled acceptance, use only businesses and customer numbers authorized for testing:

1. Sign in as the central administrator and verify access to every business. Accept an owner invitation from **Businesses**, then verify that owner's CRM, customer list, and campaigns exclude other businesses' private records.
2. Send the first customer message, receive the consent notice, and reply YES once. Confirm analysis and customer details appear automatically. Pending consent must not trigger analysis or offers.
3. Create a business campaign. Confirm AI matches only its own consenting customers and respects topic stops. Review the message and send through the central sender. A real text reply requires an open 24-hour window on that number; template delivery requires current approval. Confirm delivery callbacks.
4. Open **Offers**, add a suitable offer with its price, language and future expiry, then save. It is immediately available to the recommendation engine, even if the supplier has no WhatsApp connection or own CRM customers. Send two genuine requests about that topic to Datamine's central number. Confirm one relevant recommendation arrives there, names the seller, keeps replies in the central chat and does not expose the customer's chat to the supplier.
5. Send another ordinary topic question and confirm no extra automatic offer. Reply MORE and confirm at most one further unseen, suitable offer. If no suitable offer exists, nothing is sent.
6. Reply STOP OFFER and confirm that topic stops while unrelated interests remain eligible. MORE must not resume a stopped topic. Use a controlled contact for STOP, STOP ALL, or DELETE MY DATA; confirm saved chats, profile, recommendations, and queued sends are removed, and subsequent messages are not collected until explicit re-consent.
7. Archive or expire an offer and confirm it is excluded. Restore requires a valid future expiry. Check that a closed central customer-service window sends nothing and waits for a fresh message. No test should treat a pending template as approved.

For a presentation, refresh the temporary Meta token if needed and have the controlled customer message the central number shortly beforehand. Allow consent, analysis, and matching to finish. Saving an offer does not broadcast by itself or guarantee a match or delivery.

For isolated legacy local smoke scripts, `AUTOMATION_DISABLED=true` prevents background jobs from racing provider mocks. Restore normal startup afterward. Do not set this flag on the deployed demo unless intentionally pausing automation.

## Operational notes

One explicit YES covers collection, AI processing, and promotions. NO declines; STOP, STOP ALL, and DELETE MY DATA withdraw globally. STOP OFFER only blocks the relevant topic. Retain only the minimal withdrawal record needed to prevent further collection. The optional sample enrollment page sends no messages.

- `/api/health` checks database connectivity and the migrated user table; it is not a claim that WhatsApp or AI is connected.
- Each Next.js instance and its automation companion have separate pools of up to five PostgreSQL connections each; the optional health worker adds another pool. Adjust only after measuring load and database limits.
- Keep the credential encryption key stable across deployments. Rotating it without re-encrypting stored credentials makes them unreadable.
- Email delivery and self-service password recovery require an email provider and are not configured. Invitations are copied manually; password changes are available to authenticated users.
- Tests use PGlite for repeatable PostgreSQL semantics. Before a real pilot, repeat multi-user/concurrent-load tests on the managed PostgreSQL instance.
- `npm audit` currently reports upstream tooling advisories in ESLint's glob parser and Drizzle Kit's esbuild dependency. The affected glob inputs are repository files, and no esbuild development server is started by this app. The available automated remediation downgrades the framework tooling; do not apply `npm audit fix --force` without reviewing that change.
