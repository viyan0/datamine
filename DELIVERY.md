# Phase 5 demo delivery

## Single WhatsApp consent and automatic audiences

The flower offer had no audience because the real chat had AI-detected flower interest but no enrolled profile. One WhatsApp consent now covers collection, AI analysis and enrollment. First contact queues a notice; YES creates an automatic profile and resumes analysis. NO/STOP removes saved chat/profile data and blocks future collection. Unanswered chats stay held without AI or offers. Minimal consent records preserve the choice across businesses. AI-derived interests refresh existing offer audiences; matching still uses Haiku, without a business-specific taxonomy. The inbox replaces the second enrollment action with consent status.

Verified locally: all 13 checks, both HTTP smoke suites and a production build. The new integration test covers first notice deduplication, no pre-consent AI, YES → dynamic flower interest → existing-offer match, no repeated consent across businesses, first-message YES handling, NO suppression, and STOP during an in-flight AI request without recreating deleted data. Provider calls in automated tests are mocked. Live verification follows deployment.


## Vercel live; WhatsApp and OpenRouter Haiku verified

The demo is live at **https://datamine-lilac.vercel.app**; sample inbox: **https://datamine-lilac.vercel.app/en/demo/inbox**. Production deployment `dpl_F2Tdb3PmwhquisNwPjCpyBQjJzUX` serves source commit `ea3ad24` from GitHub `main`. Its cloud build succeeded and GitHub CI passed (run `37813767920`).

The project **viki-0760/datamine** is on Vercel Hobby with Neon Free PostgreSQL **datamine-db** in Frankfurt. Migrations and initial owner bootstrap succeeded. Production authentication, encryption, webhook, and recovery secrets are configured. Vercel Queues wake the existing PostgreSQL jobs automatically, with bounded processing, retry delays, and daily recovery. The local demo environment is preserved. The Vercel app connector has a workspace permission error and the GitHub integration attempt failed, so deployment uses the authenticated CLI from committed source. Git pushes alone do not publish a new release.

Live checks passed: public English/Arabic/Sorani sample inboxes; database health; owner sign-in; authenticated inbox/customer/campaign APIs; rejected anonymous access; correct and incorrect webhook verification tokens; authenticated business settings update; and the daily recovery endpoint. That business update invoked the managed queue consumer, which completed with HTTP 200. The consumer is inaccessible over public HTTP. Its logs contain a PostgreSQL driver's SSL-mode deprecation warning, not a processing failure. The public sample furniture inbox was also verified in Chrome. No fake messages or customer records were inserted into the production database.

The owner selected the existing **leadstest** Meta app (`1088621117427847`) in the **Leadstest** business portfolio for Datamine and authorized replacing its previous project connection. Its active WhatsApp callback is now **https://datamine-lilac.vercel.app/api/webhooks/whatsapp**, verified by Meta; the previous Railway callback was replaced while preserving its existing subscribed fields. Graph API v26.0 is configured. The test number is +1 (555) 632-3113 (phone ID `1328135173721537`, WABA `2248867165684591`). Its temporary access token and app secret were verified through Meta and stored encrypted through the Datamine connection API. The connection is also selected as the central Datamine sender. Other Meta apps and old hosting resources were not deleted.

On 2026-10-08, the owner verified a controlled recipient using Meta's WhatsApp code. The initial approved `hello_world` message was accepted, delivered, and read, with real signed status callbacks recorded in Neon. The owner's replies then created a real conversation automatically. A reply sent through the production Datamine browser inbox was delivered and read; the UI and stored message status updated automatically. This verifies Meta → Vercel webhook → PostgreSQL → inbox and Datamine inbox → Meta → recipient → delivery/read tracking. The initial template was sent directly through Meta to open the test conversation; it is not a Datamine campaign delivery test.

The owner selected OpenRouter for AI. `OPENROUTER_API_KEY` is configured as a production Secret and `OPENROUTER_MODEL=anthropic/claude-haiku-5.5` selects the same Haiku model for conversation analysis and offer matching. No Anthropic API key is needed. The client requests strict JSON, disables reasoning, validates exact source evidence, and rejects incomplete responses or a different model. Provider routing requires the requested parameter support and excludes providers that collect data. Secrets are excluded from Git and deployment uploads.

After deployment, the authenticated recovery endpoint resumed the existing pending conversation through the managed queue. Haiku automatically classified the real sofa inquiry as **Furniture pricing**, extracted **sofa**, and updated its status to **In progress**. The production API returned a complete, current saved analysis with no error, 1,864 input tokens, 224 output tokens, and 2,927 ms model-request latency. Chrome showed the generated category, summary, and customer fields without an Analyze action. A separate synthetic live OpenRouter request also passed schema and evidence validation. These checks establish connectivity and automatic processing for this test, not accuracy across all businesses or languages.

Follow-up laptop messages exposed a validation bug: the model capitalized extracted values while quoting the message correctly, so strict case-sensitive value matching rejected the entire analysis. The validator now recovers the exact original spelling from a literal case-insensitive match inside the verified quote. Invented values, changed quotes, regex-like values, and staff-only evidence still fail. The prompt prioritizes the latest active request and keeps category, intent, and fact labels open-ended. Analysis version 4 invalidates old cached results, and inbox categories use that shared version instead of a literal version number. All 12 checks and the automation smoke suite passed. After deployment, the existing failed job completed through the managed queue: Haiku generated **Laptop pricing** and **Laptop purchase**, extracted **laptop**, and saved a current analysis in 4,185 ms. The live inbox showed the new categories and summary with no retry error. No business-specific category rules were added.

The temporary Meta token is suitable for this setup test and needs replacement with a durable token for ongoing use. Meta's app-level privacy and data-deletion links still reference the previous site's pages and require replacement before a public pilot; webhook traffic already goes to Datamine.

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

Vercel uses managed queue wakeups and its existing function runtime; no Redis instance or separate worker server is required. Local/Render startup still launches the companion automation process. The optional older pg-boss worker remains for connection health only.

## Verification

- Production build, TypeScript, ESLint, and 11 unit/database/translation/scheduling checks pass after the Vercel adaptation.
- Existing HTTP smoke suite: authentication, business isolation, signed webhooks, delivery tracking, AI evidence/cache/concurrency, customer verification, consent, profile deduplication, and privacy.
- Phase 5 smoke suite: automatic scheduling/classification, arbitrary labels, manual overrides, stale-source rejection, backoff/restart recovery, campaign role/privacy boundaries, template filtering and exact-message matching, preference/consent changes, duplicate sends, late callbacks, uncertain outcomes, cancellation, natural-language opt-out, and offline STOP.
- Browser: insights appear automatically; furniture inbox, salon offer submission, simulated campaign delivery, and Arabic/Sorani mobile campaign layouts verified. Samples are clearly labeled.

All OpenRouter and outbound Meta calls in automated integration tests are mocked. The OpenRouter change passed TypeScript, ESLint, all 11 unit/database/translation checks, both HTTP smoke suites, and local/cloud production builds. Separately, live Meta recipient verification, initial template, inbound conversation, browser reply, delivery/read callbacks, and real Haiku analysis passed on the managed production database. Broader model accuracy, Datamine enrollment-code delivery, and WhatsApp campaign delivery remain unverified. Public sample data does not make real provider calls.

## External setup still required — Phase 6

- **Hosting:** Vercel and Neon are deployed and verified. The optional GitHub-to-Vercel integration remains unconnected; use the CLI to release new commits. Render remains an alternative; its earlier free database creation returned HTTP 402 requiring billing setup.
- **AI:** OpenRouter with Claude Haiku 5.5 is deployed and a real conversation passed automatic analysis. Review accuracy with representative English, Arabic, and Sorani conversations across business types; maintain provider credits.
- **WhatsApp:** the test sender, verified webhook, central sender, controlled recipient, and real inbox round trip are connected and verified. For continued use, replace the temporary token, update the old privacy/data-deletion site links, and provide supported approved marketing templates in the intended languages. Campaign delivery remains untested with real recipients.
- **Pilot review:** native-speaker Arabic/Sorani review and a complete inquiry → opt-in → offer → opt-out test on managed PostgreSQL. Always-on hosting is needed for prompt processing; a sleeping free web service only processes jobs while awake.

Demo limits: one inquiry per contact/number, latest 100 displayed messages, 30 text messages per AI analysis, 100 eligible profiles per offer language, and static templates from the first 100 returned by Meta. No assignments, reminder scheduler, media transcription, or automatic conversational replies.
