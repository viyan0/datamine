# Phase 3 demo delivery

## Implemented and locally verified

- Staff authentication, agency roles and invitations, with closed public registration.
- PostgreSQL migrations and one-time owner bootstrap.
- English, Arabic, and Sorani interfaces with responsive desktop/mobile layouts.
- Agency-scoped data access and incoming-message inspection.
- Meta number verification, encrypted credentials, signed webhook ingestion, and duplicate suppression.
- Agency inbox with search, status filters, customer details, travel service/destination, and one private note.
- Text replies use the correct agency number, persisted request IDs, the 24-hour reply window, and provider delivery tracking. Late callbacks do not regress delivery state; timeouts remain uncertain until reconciled.
- Interactive sample inbox with explicitly simulated replies and temporary edits.
- One-click Haiku analysis: service/intent/language, summary, travel facts with source quotes, and a suggested next step. Results are saved separately from staff edits.
- Localized prepared analysis previews in the public demo, with no external AI calls.
- Render Blueprint and optional connection-health background worker.

Validation: production build, TypeScript, ESLint, eight automated unit/database/translation tests, and the local HTTP smoke suite. Coverage includes inbox permissions/delivery, saved AI results, cache reuse, invalid source evidence, concurrent analysis, stale results, model configuration, refusals, malformed responses, and unchanged staff fields. Meta and Anthropic requests are mocked. The existing Render Blueprint is unchanged.

Browser verification passed for the prepared English analysis, extracted fields and source quotes, Arabic RTL summary, and Sorani mobile preview.

The demo uses one inquiry record per contact per connected number, the latest 100 messages, manual refresh, and manual analysis of up to 30 recent text messages. Assignments, reminders, templates, media downloads, multi-trip records, and automatic background analysis are deferred. No new package or background service is required.

## External setup still required

- **Render hosting is blocked:** creating the free PostgreSQL instance returned HTTP 402, requiring billing information at https://dashboard.render.com/billing. No database or web service has been provisioned, and no live URL has been verified.
- **Real WhatsApp onboarding is pending:** agency Meta credentials and webhook subscriptions are needed. Tests so far use signed synthetic messages in an isolated local database.
- **Live AI verification is pending:** no Anthropic API key is configured. Sample results are prepared fixtures; real Haiku accuracy, latency, and cost have not been measured.
- The optional worker is implemented but not hosted. Render workers require a paid instance; the demo Blueprint only provisions the web service and database.
- Sorani/Arabic copy needs native-speaker pilot review.

No external AI requests or outbound WhatsApp messages were made during implementation.
