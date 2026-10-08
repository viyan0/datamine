# Deployment

## Vercel (current demo host)

The linked project is **viki-0760/datamine**, with Neon Free PostgreSQL **datamine-db** in Frankfurt. `vercel.ts` selects Next.js, the Frankfurt function region, a queue consumer, and a daily recovery job. Vercel runs Next.js directly; it does not run the local `npm start` companion loop.

1. Connect a Neon PostgreSQL resource to **Production**. Use its pooled `DATABASE_URL` for the app. Keep `.env.local` for local development; pull cloud variables into an ignored file with `vercel env pull .local/production.env --environment=production`.
2. Configure production `BETTER_AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY` (64 hex characters), `WHATSAPP_VERIFY_TOKEN`, `CRON_SECRET`, `OPENROUTER_MODEL=anthropic/claude-haiku-5.5`, `OPENROUTER_API_KEY`, and `META_GRAPH_VERSION=v26.0`. Secrets must stay server-side. The app derives its production URL from Vercel; a custom canonical domain can use `BETTER_AUTH_URL`.
3. Before deploying a schema change, run `scripts/migrate.ts` with the intended database's **unpooled** URL. Run `scripts/bootstrap.ts` once with an owner email and a strong temporary password. These commands are deliberately separate from preview builds. Never point the local smoke suites at this database.
4. Run the checks, commit and push, then `vercel deploy --prod --scope viki-0760`. The current GitHub integration could not be connected, so pushes alone do not deploy. The CLI publishes the checked local source; `.vercelignore` excludes local secrets and test data.
5. Verify `/api/health`, the three language routes, sign-in, and authenticated business APIs. Keep preview deployment protection enabled. Change the temporary owner password through Settings after delivery.

Incoming webhooks, replies, business edits, and campaign actions publish a small queue wakeup. PostgreSQL still owns the jobs, leases, retry delays, and send claims. A bounded Vercel Function processes work, schedules another wake only when needed, and stops when idle. A secret-protected daily job recovers saved work after a missed queue publish. Webhooks return a retryable error if the wakeup fails; already-sent replies are still reported accurately. Actual campaign sends still require explicit approval in the app.

Neon and production secrets are configured and migrations/bootstrap have completed. Current release and live test results are recorded in `DELIVERY.md`.

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

## Connect real WhatsApp businesses

For this demo, use the existing **leadstest** Meta app (`1088621117427847`) in the **Leadstest** business portfolio, as selected by the owner. Replace its previous project's callback with the deployed Datamine `/api/webhooks/whatsapp` endpoint once the public service is healthy and the connection credentials are configured. Meta currently shows the `messages` subscription at Graph API v26.0; confirm the version and set `META_GRAPH_VERSION` when connecting. The test sender is **+1 (555) 632-3113**, phone ID `1328135173721537`, WABA ID `2248867165684591`. Use a verified recipient controlled by the owner. Temporary test tokens expire and must be refreshed before subsequent demos. Changing the callback disconnects incoming events from the old project; deleting that project's app, data, or hosting resources is not required.

1. Create each business with its type and optional category hints, then invite its staff. Validate that a staff account cannot access another business's message endpoint.
2. An agency owner/admin opens **WhatsApp connections → Connect number** and supplies its existing Meta phone number ID, WABA ID, system-user token, and app secret. The server checks the phone belongs to the WABA using Meta's API before encrypting the credentials.
3. The workspace owner copies the callback URL and verification token from the connections page. Configure the callback in Meta and subscribe to the `messages` field for the appropriate app/WABA. Existing integrations may already use that callback; review or arrange event forwarding before replacing it.
4. Send a controlled test text to each real number. The connection changes from **Credentials verified** to **Receiving events** only after a valid, signed callback. Inspect received messages and confirm agency routing.
5. Replay a webhook and confirm the stored message count does not increase.

Provider verification and webhook processing are covered by mocked automated tests. The deployed test sender, live webhook, and a real incoming/outgoing WhatsApp conversation have also been verified; see DELIVERY.md for current live results and remaining pilot checks. Text replies use the customer-service window. Campaigns support static approved marketing templates from the selected central Datamine sender.

## Enable conversation analysis

Add `OPENROUTER_API_KEY` to the web service environment and retain `OPENROUTER_MODEL=anthropic/claude-haiku-5.5`. Do not prefix the key with `NEXT_PUBLIC_` or add it to Git. Redeploy or restart after setting the key. The existing start command launches the automation process alongside the web app; no additional hosted service is needed. The sample preview works without this key.

Once configured, send a controlled incoming text and wait for automatic analysis. Check categories, dynamic fact labels, extracted quotes, summary language, and missing details. Repeat with different business types in English, Arabic, and Sorani. Confirm results survive reload, new messages update them, and manual corrections and staff notes are preserved. There is no analysis button. Automated checks mock OpenRouter; see DELIVERY.md for live verification results. OpenRouter credentials with no remaining credits leave analysis pending with setup guidance.

## Verify campaigns

Connect the central Datamine WhatsApp sender and select it in Campaigns. Create a simple approved marketing template in the customer's language through Meta. This demo supports body/footer text only; templates with variables, media, or buttons are excluded. Meta must support and approve the requested language; the app never substitutes another language silently.

Enroll a controlled recipient with explicit interests. Submit an offer and verify that the audience appears automatically, then select the template and verify that matching runs again against its exact text. Review the message and use Send approved offer for the controlled live test. Confirm delivery callbacks, cancel a queued test, change preferences, and verify STOP and a natural-language opt-out prevent subsequent sends. This live acceptance is still pending.

For isolated local smoke tests only, set AUTOMATION_DISABLED=true on the app process so test doubles exclusively control provider requests. Restore normal startup afterward. Do not set this flag on the deployed demo unless intentionally pausing automation.

## Operational notes

For the consent flow, use a controlled customer number. Its first message must queue the WhatsApp notice. Reply YES once and confirm automatic profile creation, AI interests and refreshed offer matches. With a separate test contact, reply NO/STOP and confirm removal of messages, conversations and the profile; subsequent messages must not be retained. The optional sample enrollment page sends no messages.

- `/api/health` checks database connectivity and the migrated user table; it is not a claim that WhatsApp or AI is connected.
- Each Next.js instance and its automation companion have separate pools of up to five PostgreSQL connections each; the optional health worker adds another pool. Adjust only after measuring load and database limits.
- Keep the credential encryption key stable across deployments. Rotating it without re-encrypting stored credentials makes them unreadable.
- Email delivery and self-service password recovery require an email provider and are not configured. Invitations are copied manually; password changes are available to authenticated users.
- Tests use PGlite for repeatable PostgreSQL semantics. Before a real pilot, repeat multi-user/concurrent-load tests on the managed PostgreSQL instance.
- `npm audit` currently reports upstream tooling advisories in ESLint's glob parser and Drizzle Kit's esbuild dependency. The affected glob inputs are repository files, and no esbuild development server is started by this app. The available automated remediation downgrades the framework tooling; do not apply `npm audit fix --force` without reviewing that change.
