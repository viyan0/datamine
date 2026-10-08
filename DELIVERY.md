# Phase 2 demo delivery

## Implemented and locally verified

- Staff authentication, agency roles and invitations, with closed public registration.
- PostgreSQL migrations and one-time owner bootstrap.
- English, Arabic, and Sorani interfaces with responsive desktop/mobile layouts.
- Agency-scoped data access and incoming-message inspection.
- Meta number verification, encrypted credentials, signed webhook ingestion, and duplicate suppression.
- Agency inbox with search, status filters, customer details, travel service/destination, and one private note.
- Text replies use the correct agency number, persisted request IDs, the 24-hour reply window, and provider delivery tracking. Late callbacks do not regress delivery state; timeouts remain uncertain until reconciled.
- Interactive sample inbox with explicitly simulated replies and temporary edits.
- Render Blueprint and optional connection-health background worker.

Validation passed: production build, TypeScript, ESLint, six automated unit/database/translation tests, and the local HTTP smoke suite. Phase 2 smoke coverage includes persisted customer edits, viewer/cross-agency restrictions, duplicate sends, reply-window enforcement, out-of-order receipts, rejected sends, and uncertain-send reconciliation. Meta requests are mocked. Browser checks cover a sample reply and saved inquiry/note, English desktop, Arabic RTL desktop, and Sorani mobile details. The existing Render Blueprint is unchanged.

The demo uses one inquiry record per contact per connected number, the latest 100 messages, and manual refresh. Assignments, reminders, templates, media downloads, multi-trip records, and AI are deferred. No new package or background service is required.

## External setup still required

- **Render hosting is blocked:** creating the free PostgreSQL instance returned HTTP 402, requiring billing information at https://dashboard.render.com/billing. No database or web service has been provisioned, and no live URL has been verified.
- **Real WhatsApp onboarding is pending:** agency Meta credentials and webhook subscriptions are needed. Tests so far use signed synthetic messages in an isolated local database.
- The optional worker is implemented but not hosted. Render workers require a paid instance; the demo Blueprint only provisions the web service and database.
- Sorani/Arabic copy needs native-speaker pilot review.

No AI requests or outbound WhatsApp messages were made. Haiku integration is scheduled for Phase 3.
