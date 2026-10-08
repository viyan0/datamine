# Phase 1 delivery

## Implemented and locally verified

- Staff authentication, agency roles and invitations, with closed public registration.
- PostgreSQL migrations and one-time owner bootstrap.
- English, Arabic, and Sorani interfaces with responsive desktop/mobile layouts.
- Agency-scoped data access and incoming-message inspection.
- Meta number verification, encrypted credentials, signed webhook ingestion, and duplicate suppression.
- Read-only sample dashboard with explicitly labelled sample records.
- Render Blueprint and optional connection-health background worker.

Validation passed: production build, TypeScript, ESLint, five automated unit/database/translation tests, the local HTTP smoke suite, and validation against Render's official Blueprint schema. Browser checks covered English desktop, Arabic RTL desktop, and Sorani mobile/navigation.

## External setup still required

- **Render hosting is blocked:** creating the free PostgreSQL instance returned HTTP 402, requiring billing information at https://dashboard.render.com/billing. No database or web service has been provisioned, and no live URL has been verified.
- **Real WhatsApp onboarding is pending:** agency Meta credentials and webhook subscriptions are needed. Tests so far use signed synthetic messages in an isolated local database.
- The optional worker is implemented but not hosted. Render workers require a paid instance; the demo Blueprint only provisions the web service and database.
- Sorani/Arabic copy needs native-speaker pilot review.

No AI requests or outbound WhatsApp messages were made. Haiku integration is scheduled for Phase 3.
