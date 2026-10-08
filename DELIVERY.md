# Phase 4 demo delivery

## Implemented and locally verified

- Staff authentication, business roles and invitations, with closed public registration.
- PostgreSQL migrations and one-time owner bootstrap.
- English, Arabic, and Sorani interfaces with responsive desktop/mobile layouts.
- Business-scoped data access and incoming-message inspection.
- Meta number verification, encrypted credentials, signed webhook ingestion, and duplicate suppression.
- Business inbox with search, status filters, customer details, a category, product/service/topic, and one private note.
- Custom business types and categories used by Haiku; no fixed travel-only classification. Sample workspaces include travel, furniture, and a salon.
- Text replies use the correct agency number, persisted request IDs, the 24-hour reply window, and provider delivery tracking. Late callbacks do not regress delivery state; timeouts remain uncertain until reconciled.
- Interactive sample inbox with explicitly simulated replies and temporary edits.
- One-click Haiku analysis: category/intent/language, summary, request/location/date/quantity/budget with source quotes, and a suggested next step. Results are saved separately from staff edits.
- Localized prepared analysis previews in the public demo, with no external AI calls.
- Customer-created shared profiles after WhatsApp number verification and explicit consent, with preferences, opt-out, and re-enrollment.
- A central customer directory restricted to platform administrators. Business conversations, notes, and inferred preferences are not copied into shared profiles.
- Expiring enrollment links, code hashing and throttling, single-use verification codes, HttpOnly customer sessions, and consent event history.
- A simulated customer opt-in flow at `/en/enroll/demo` using code `123456`, with tab-local sample preferences visible at `/en/demo/customers`.
- Render Blueprint and optional connection-health background worker.

Validation: production build, TypeScript, ESLint, nine automated unit/database/translation tests, and the local HTTP smoke suite. Coverage includes business permissions/settings, custom categories, inbox delivery, AI cache/evidence/concurrency, verification replay/expiry/throttling, explicit consent, shared profile deduplication, opt-out persistence, session expiry, and private-data boundaries. Meta and Anthropic requests are mocked. The existing Render Blueprint is unchanged.

Browser verification passed for sample enrollment, consent, preferences, opt-out, the central list, furniture classification, salon categories, and Arabic/Sorani mobile enrollment layouts.

The demo uses one inquiry record per contact per connected number, the latest 100 messages, manual refresh, and manual analysis of up to 30 recent text messages. Campaigns, assignments, reminders, templates, media downloads, multiple inquiry records, and automatic background analysis are deferred. No new package or background service is required.

## External setup still required

- **Render hosting is blocked:** creating the free PostgreSQL instance returned HTTP 402, requiring billing information at https://dashboard.render.com/billing. No database or web service has been provisioned, and no live URL has been verified.
- **Real WhatsApp onboarding is pending:** business Meta credentials and webhook subscriptions are needed. Tests so far use signed synthetic messages in an isolated local database. Real verification-code delivery also remains untested.
- **Live AI verification is pending:** no Anthropic API key is configured. Sample results are prepared fixtures; real Haiku accuracy, latency, and cost have not been measured.
- The optional worker is implemented but not hosted. Render workers require a paid instance; the demo Blueprint only provisions the web service and database.
- Sorani/Arabic copy needs native-speaker pilot review.

No external AI requests or outbound WhatsApp messages were made during implementation.
