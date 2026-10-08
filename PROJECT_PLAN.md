# Datamine demo plan

Updated 8 October 2026. Phase 5 is implemented locally. Real provider and Render acceptance remains Phase 6; see DELIVERY.md.

## Keep the demo simple

Datamine works for any business, with multiple existing WhatsApp Cloud API inboxes and English, Arabic, and Sorani interfaces. One inquiry record per contact and connected number, one private note, text messages, and simple approved marketing templates are enough for this demo. Assignments, reminders, media transcription, billing, and advanced analytics are outside scope.

## Stack

- Next.js, React, TypeScript, next-intl, and the existing component styles.
- PostgreSQL on Render, Drizzle ORM, and Better Auth.
- Meta WhatsApp Cloud API for actual messages and delivery events.
- Claude Haiku 5.5 for every AI classification, extraction, summary, and offer match. No fallback model.
- One Render web service with a companion automation process and one PostgreSQL database. No Redis or extra hosted worker is required for this demo. The older optional pg-boss worker handles connection health only.

## Building phases

1. **Foundation:** login, roles, businesses, languages, migrations, encrypted WhatsApp connections, signed webhooks, and Render configuration. Local implementation complete; hosting and real onboarding pending.
2. **Inbox:** message history, search, simple customer details, private notes, replies, and delivery tracking. Complete locally.
3. **AI insights:** Haiku analysis and evidence validation. Now automatic: new messages schedule analysis, details update, and the inbox refreshes itself. Complete with mocked provider checks; real accuracy/latency checks pending.
4. **Customer opt-in:** number verification, explicit consent, self-declared preferences, central profiles, and opt-out. Complete locally; real code delivery pending.
5. **Offers:** business submits an offer; Haiku classifies it and matches eligible customers automatically. Datamine selects an approved message, the audience updates automatically for its exact text, and staff explicitly launch delivery. Complete locally with mocked provider checks.
6. **Live acceptance:** finish Render billing/deployment, connect real Meta accounts and Anthropic, then test a controlled inquiry-to-offer journey in all three languages.

## Automatic decisions

Haiku invents relevant category and intent labels and chooses useful facts for each conversation. Business category hints are optional. There is no fixed travel taxonomy or fixed extraction checklist. Facts contain an inbound message ID and an exact supporting quote; values must occur in that quote. Missing facts remain absent. Names, phone numbers, consent, permissions, and delivery receipts come from application or provider records.

New inbound messages and successful outbound replies schedule a short, persistent PostgreSQL job. The app processes jobs automatically, including after restart. A bounded text window, source hash, lease, and revision checks prevent duplicate work and stale results. Provider failures retry with backoff and preserve previous data. Media-only conversations wait for text. Manual field corrections are retained until staff explicitly restore automatic details.

## Offers and consent

Haiku receives offer text and eligible customers' self-declared interests/topic/language, without names, phone numbers, business chat histories, or staff notes. Enrollment, opt-out, pending opt-out checks, preferred language, and profile revisions are enforced in code. The demo supports up to 100 eligible profiles per language. Datamine administrators can see the audience; business staff see their own offers and status.

Sending uses a selected central Datamine number and an approved static marketing template. Its exact message is visible before launch and matched automatically. Each recipient is claimed durably; consent and the profile revision are checked again immediately before submission. Uncertain submissions are never blindly retried. STOP works without AI, while other incoming texts on the Datamine number hold further offers until automatic analysis checks for an opt-out. AI can never enroll or re-enroll a customer.

## Phase 6 acceptance

- Provision Render and verify its public health endpoint and all three language routes.
- Connect controlled Meta numbers; verify signed incoming events, correct routing, replies, template sends, and delivery callbacks.
- Add the Anthropic key and verify automatic categories, facts, corrections, missing information, and natural-language opt-outs across different business types and all three languages.
- Review Arabic/Sorani copy with native speakers and measure real model accuracy, latency, and cost.
- Complete opt-in → preferences → relevant offer → opt-out with controlled recipients. Repeat restart and concurrent-update tests on managed PostgreSQL.

Public demo data is explicitly prepared/simulated. It does not demonstrate live AI or actual WhatsApp delivery.
