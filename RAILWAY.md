# Railway deployment

Railway is the current requested hosting target. Use the GitHub repository `viyan0/datamine`, branch `main`, one app service, and one PostgreSQL service. The existing Render configuration is retained as an alternative.

## Services

1. Create a Railway project called Datamine and add PostgreSQL.
2. Add the GitHub repository as the app service. Railway detects the root Dockerfile. It builds with Node 24 and runs the existing startup script as an unprivileged user.
3. Connect `DATABASE_URL` to the PostgreSQL service using Railway's reference-variable picker. Use its private URL. No public database endpoint is needed for normal operation.
4. Configure the server variables below, generate a public domain targeting port 3000, and set `/api/health` as the deployment health check with a 120-second timeout.
5. Keep one app instance with server sleeping disabled so incoming jobs process promptly. Startup migrates the database, creates the initial owner only on an empty database, and starts both Next.js and the automation companion. No separate worker or Redis is needed.

## Variables

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Reference to the PostgreSQL service's private connection string |
| `PORT` | `3000`, matching the public domain's target port |
| `BETTER_AUTH_SECRET` | New random secret, at least 32 characters |
| `CREDENTIAL_ENCRYPTION_KEY` | New 32-byte key encoded as 64 hex characters |
| `WHATSAPP_VERIFY_TOKEN` | New random verification secret, at least 32 characters |
| `BOOTSTRAP_ADMIN_EMAIL` | Workspace owner's email |
| `BOOTSTRAP_ADMIN_PASSWORD` | Strong initial password, at least 12 characters |
| `BOOTSTRAP_ADMIN_NAME` | Workspace owner |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` |
| `ANTHROPIC_API_KEY` | Server-only key for live analysis and matching |
| `META_GRAPH_VERSION` | API version supported by the connected Meta app |

The app uses Railway's `RAILWAY_PUBLIC_DOMAIN` for its canonical HTTPS URL. Set `BETTER_AUTH_URL` only to override it with the actual public URL; never import the example's localhost value into the hosted service. Keep the encryption key stable. Store secrets in Railway variables, not Git, screenshots, or chat. Remove the bootstrap password after the initial account is set up.

## Meta demo connection

Create the Datamine Meta app with the WhatsApp use case and the owner's selected business portfolio. Use Meta's test WhatsApp sender and a verified recipient controlled by the owner. In Datamine, connect the provided phone number ID, WABA ID, access token, and app secret. Configure the app's public `/api/webhooks/whatsapp` URL and its verification token in Meta, then subscribe to message events.

Confirm the supported Graph API version in Meta before configuring it. Temporary test tokens expire; note their expiry and refresh them before the next demo. Never replace another app's existing webhook or connect unrelated numbers.

## Live verification

- `/api/health` returns HTTP 200 with `database: connected` and phase 5.
- English, Arabic, and Sorani demo routes load; authenticated business pages remain private.
- A controlled incoming WhatsApp text appears once, then gets categories, facts, and status automatically.
- A reply arrives on the verified recipient, with callback-driven delivery status.
- An opt-in code verifies the recipient, explicit enrollment creates a profile, and preferences persist.
- An offer gets automatically matched; an approved supported template reaches only the controlled enrolled recipient. Withdrawal blocks later sends.
- Real Haiku calls succeed, preserve quoted facts, and use the selected model. Samples or mocked provider tests do not count as live verification.

Setup status and unresolved external steps are recorded in DELIVERY.md. Charges, account approvals, terms, and verification prompts must be resolved in the respective account before claiming deployment is complete.

Sources: [Railway Docker deployments](https://docs.railway.com/builds/dockerfiles), [service/reference variables](https://docs.railway.com/variables), and [PostgreSQL setup](https://docs.railway.com/guides/nextjs#add-a-postgres-database).
