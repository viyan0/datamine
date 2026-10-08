# Render deployment

The intended workspace is **Viyan's workspace** (`tea-d20g506mcj7s73b50i10`), using the repository `https://github.com/viyan0/datamine` and the `main` branch. App and database belong in Frankfurt so the app can use the private database connection.

## Foundation deployment

`render.yaml` describes a Next.js web service and PostgreSQL 17 database on free demo plans. Deploy the Blueprint at:

https://dashboard.render.com/blueprint/new?repo=https://github.com/viyan0/datamine

The same two resources can be created through Render's API/MCP, using the build/start commands and environment variables in the Blueprint. Do not apply a second Blueprint on top of separately provisioned resources without first checking for duplicates.

1. Ensure this repository is accessible to Render and the account's billing setup is complete if Render requests it.
2. Set `CREDENTIAL_ENCRYPTION_KEY`, bootstrap email, and a strong bootstrap password. The Blueprint generates authentication and webhook verification secrets.
3. Use the database's **internal** connection string. The Blueprint restricts external database access; it does not affect private networking.
4. Build with `npm ci --include=dev && npm run build`. Start with `npm start`.
5. Startup applies versioned Drizzle migrations, bootstraps the first owner if needed, and binds Next.js to `0.0.0.0:$PORT`. Startup fails on migration errors rather than serving a partially initialized app.
6. Wait for Render's deploy status to become `live`, then check `/api/health` for HTTP 200 and `database: connected`.
7. Verify `/en`, `/ar`, `/ckb` and the sample tour. Sign in with the bootstrap account, create an agency, and test an invitation. Change the initial password and remove the bootstrap password environment variable.

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

Render background workers require a paid plan, so the free demo Blueprint does not provision one. Failed health-check jobs retry with backoff and remain in pg-boss for inspection. AI analysis queues will be added with Phase 3.

## Connect real WhatsApp agencies

1. Create each agency and invite its staff. Validate that a staff account cannot access another agency's message endpoint.
2. An agency owner/admin opens **WhatsApp connections → Connect number** and supplies its existing Meta phone number ID, WABA ID, system-user token, and app secret. The server checks the phone belongs to the WABA using Meta's API before encrypting the credentials.
3. The workspace owner copies the callback URL and verification token from the connections page. Configure the callback in Meta and subscribe to the `messages` field for the appropriate app/WABA. Existing integrations may already use that callback; review or arrange event forwarding before replacing it.
4. Send a controlled test text to each real number. The connection changes from **Credentials verified** to **Receiving events** only after a valid, signed callback. Inspect received messages and confirm agency routing.
5. Replay a webhook and confirm the stored message count does not increase.

No real Meta credentials were supplied during implementation. Provider verification, live webhook subscriptions, and real message routing cannot be claimed complete until these steps are performed. Phase 2 implements text replies within the customer-service window; a controlled real reply and delivery callback test remains pending. Templates are outside the demo.

## Operational notes

- `/api/health` checks database connectivity and the migrated user table; it is not a claim that WhatsApp or AI is connected.
- Each Next.js instance uses at most five PostgreSQL connections; the optional worker uses a separate pool. Adjust only after measuring load and database limits.
- Keep the credential encryption key stable across deployments. Rotating it without re-encrypting stored credentials makes them unreadable.
- Email delivery and self-service password recovery require an email provider and are not configured. Invitations are copied manually; password changes are available to authenticated users.
- Tests use PGlite for repeatable PostgreSQL semantics. Before a real pilot, repeat multi-user/concurrent-load tests on the managed PostgreSQL instance.
- `npm audit` currently reports upstream tooling advisories in ESLint's glob parser and Drizzle Kit's esbuild dependency. The affected glob inputs are repository files, and no esbuild development server is started by this app. The available automated remediation downgrades the framework tooling; do not apply `npm audit fix --force` without reviewing that change.
