# Phase 5 demo delivery

## Render and Meta setup in progress

Render is the requested hosting target, using the existing Blueprint and PostgreSQL in Viyan's workspace. Railway-specific configuration has been removed. The connected Render workspace currently has no services or databases.

The owner selected the existing **leadstest** Meta app (`1088621117427847`) in the **Leadstest** business portfolio for Datamine and authorized replacing its previous project connection. Its WhatsApp callback currently points to the previous Railway project; the `messages` subscription uses Graph API v26.0. The callback has not been changed: Datamine first needs a working public Render URL. No new Meta app or portfolio is needed. A controlled WhatsApp test recipient and a server-side Anthropic API key are still required for live verification.

## Implemented

- Existing business login, roles, encrypted WhatsApp connections, signed message ingestion, inbox/replies, multilingual UI, verified customer opt-in, and private-data boundaries.
- Automatic Haiku analysis after new inbound messages, successful replies, and business context changes. PostgreSQL jobs resume after restart and retry provider errors with backoff.
- AI-generated category and intent labels and flexible fact labels, with exact source quote/value checks. No travel-only taxonomy or fixed extraction checklist.
- Automatic category, product/service/topic, and inquiry-state updates; manual corrections and private notes remain intact. Existing non-default CRM fields are preserved as manual values on migration.
- Automatic inbox refresh, with prepared sample insights shown without an Analyze button.
- Offer submission, automatic AI classification and audience matching, match reasons, and platform-admin review. Matching uses only self-declared profile interests/topic/language, without private chats, staff notes, names, or phone numbers.
- One configurable Datamine sender and static approved marketing templates. Selecting a message automatically rematches its exact text. Explicit launch, durable recipient claims, cancellation, provider delivery tracking, and uncertain-send handling.
- Enrollment, language, profile revision, and opt-out checks before delivery. Incoming Datamine messages hold offers while AI checks withdrawal; explicit STOP works without AI. A historical withdrawal cannot overwrite fresh explicit enrollment.
- English, Arabic, and Sorani campaign interfaces and a prepared public campaign demo with simulated sends.

No new package, Redis instance, or extra hosted worker is required. The automation process starts alongside the app. The optional older pg-boss worker remains for connection health only. The Render Blueprint requests the server-side Anthropic key during setup.

## Verification

- Production build, TypeScript, ESLint, and 10 unit/database/translation checks.
- Existing HTTP smoke suite: authentication, business isolation, signed webhooks, delivery tracking, AI evidence/cache/concurrency, customer verification, consent, profile deduplication, and privacy.
- Phase 5 smoke suite: automatic scheduling/classification, arbitrary labels, manual overrides, stale-source rejection, backoff/restart recovery, campaign role/privacy boundaries, template filtering and exact-message matching, preference/consent changes, duplicate sends, late callbacks, uncertain outcomes, cancellation, natural-language opt-out, and offline STOP.
- Browser: insights appear automatically; furniture inbox, salon offer submission, simulated campaign delivery, and Arabic/Sorani mobile campaign layouts verified. Samples are clearly labeled.

All Anthropic and outbound Meta calls in integration tests are mocked. Real model accuracy, latency, cost, verification-code delivery, and WhatsApp campaign delivery have not been measured. Public sample data does not make real provider calls.

## External setup still required — Phase 6

- **Render:** the earlier free PostgreSQL creation returned HTTP 402 requiring billing setup at https://dashboard.render.com/billing. No database/web service or public live URL has been provisioned or verified.
- **Anthropic:** configure a server-side API key with access to the selected model, claude-haiku-5-5, then verify automatic analysis with real conversations.
- **WhatsApp:** connect real Meta assets, webhook subscriptions, the central Datamine sender, and approved templates in the intended languages. Test with controlled recipients.
- **Pilot review:** native-speaker Arabic/Sorani review and a complete inquiry → opt-in → offer → opt-out test on managed PostgreSQL. Always-on hosting is needed for prompt processing; a sleeping free web service only processes jobs while awake.

Demo limits: one inquiry per contact/number, latest 100 displayed messages, 30 text messages per AI analysis, 100 eligible profiles per offer language, and static templates from the first 100 returned by Meta. No assignments, reminder scheduler, media transcription, or automatic conversational replies.
