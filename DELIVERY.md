# Datamine delivery

## Returning to an earlier offer topic, 2026-10-10

The topic-switch classifier now compares a request with the most recently handled topic, instead of excluding every topic previously offered. Laptop → camera → laptop therefore requests one unseen laptop offer without MORE. Repeating the current product (including synonyms) stays quiet; explicit MORE still requests another option, and topic stops remain in force.

The last handled topic includes an acknowledged empty result. Requests are ordered by their original message timestamps, so retrying an older waiting request does not overwrite the newer conversation context. Source checks include this context before delivery. Existing offer-ID deduplication and consent checks remain intact.

Validation: 84 automated tests, targeted lint and the production build passed. A read-only live Haiku replay classified the actual “I need some laptops” message as a switch back from camera and selected the unseen Study laptop demo offer. Separate live checks covered same-topic repetition, a synonym, switching to camera and a topic stop.

## Switching offer topics across WhatsApp inboxes, 2026-10-10

A new product request after an earlier offer now starts its own recommendation without requiring MORE. Haiku decides whether the request is a different topic; repeating the already answered topic still waits for an explicit request for more. Categories remain dynamic.

The central matcher now includes the same consenting customer's recent business-chat requests and uses the newest quoted subject, so MORE after a business camera request cannot silently inherit an older laptop context. Business CRM access stays scoped to that business. Saved requests for future offers keep their original topic and message cutoff.

Verification: 82 automated tests passed, including the cross-inbox topic switch, stale central analysis, repeat prevention, waiting inventory, stops, consent and tenant boundaries. A read-only replay of the actual camera/MORE messages through live Haiku selected the camera kit offer in both cases; repeating the old laptop interest was not classified as a new topic. The replay sent no WhatsApp messages and changed no customer data.

## Separate admin and business dashboards, 2026-10-10

The platform administrator has a dashboard for businesses, active offers, enrolled customers and automatic offer deliveries. Datamine's central WhatsApp workspace is flagged as a platform account and excluded from business totals and business selectors. Creating a business no longer makes the administrator its owner. Migration `0015_platform_workspace` also removes old administrator memberships without changing business users, conversations or sender connections.

The administrator has no inbox navigation or message viewer. Direct inbox pages redirect to the admin dashboard, and all conversation, message, analysis, reply and enrollment endpoints reject platform-admin sessions. Business users retain their own dashboard and inbox; membership checks isolate their data. The public sample dashboard remains a business CRM preview. English, Arabic and Sorani labels are included.

Both local and live demo databases now have five businesses and eleven active offers with photos: Demo Electronics (3), Demo Tech Market (2), Demo Camera House (2), Demo Bloom Flowers (2), and Demo Home Living (2). Offers expire on October 17 at 23:59 Baghdad time. These are illustrative demonstration listings. Only Demo Electronics has the separate business WhatsApp test inbox; the other businesses populate the offer catalog. Its owner test account is `business@datamine.demo`; credentials are kept outside Git.

For the presentation, sign in with the existing admin account to see all five businesses, then use the business account to inspect only Demo Electronics and its three offers. Message the business test number to start the customer flow, approve once in Datamine's central chat, then request laptop, camera or flower offers. MORE asks for the next relevant offer; STOP OFFER stops that topic. Existing customer consent and real test messages were preserved for this release.

Validation: all 80 automated checks pass, including real HTTP-session tests for admin inbox denial, unauthenticated denial, business isolation and offer permissions. Provider calls in these tests are mocked. The release also includes the pending UI refresh and configurable business offer follow-up behavior from the previous release branch.

## Live image offer verified, 2026-10-09

At the user's explicit request, one **Dell image delivery test** campaign was sent only to the controlled customer ending 8010 through the existing `deliverRecipient` application path. It copied the saved Dell offer price (12,000 IQD) and seller contact, used a sample public Dell laptop PNG, and labelled the photo as illustrative because the actual offer model is unspecified. The original catalog offer was not assigned an invented product photo, and the test campaign is not published for automatic recommendations.

The sender, accepted consent, active profile, topic preferences, current product and central reply window were checked before submission and rechecked by the delivery function. Stable test IDs prevent duplicate submissions. Message `6bee56fd-431d-428d-b198-cb8553baea91` was submitted as `type: image`, contains a caption without the image URL, and received Meta's **Delivered** callback. Chrome confirmed the inbox image loaded at 509 by 402 pixels. Screenshot: `artifacts/whatsapp-native-image-delivered.png` (local, ignored). The image source is Dell's official [Dell 14 Plus page](https://www.dell.com/en-us/shop/laptop-computers/spd/dellplus14laptopdb14250). No application change or new deployment was necessary for this test.

This verifies native image delivery in an open customer-service window with a caption under 1,024 characters. The existing long-caption/text-template link fallback remains; a separate business-number handoff is still unverified live.

## One central consent, seller contacts and offer photos, 2026-10-09

Application commit `ee4d73b` is pushed to GitHub and deployed to https://datamine-lilac.vercel.app as `dpl_CcqsUYBMYxshuE8HzAVQmcyoaiWY`. The production build and TypeScript compilation passed. Migration `0013_business_consent_offer_media` is applied to local and production PostgreSQL.

A first message to a connected business queues one invitation from that business to Datamine's central WhatsApp chat. This invitation is not consent. The customer opens Datamine, receives the privacy notice and replies YES once. Subsequent connected-business conversations use that same consent without another enrollment. Chats awaiting a decision are held without AI processing; declining or withdrawing removes saved chats, interests and recommendation references. Business users retain access only to their own CRM.

Recommendation evidence can now come from a business conversation while delivery always uses Datamine's central sender and its separate reply window. A fresh business request outside that window prepares a marketing template and waits for Meta approval. One offer, contextual MORE, topic stops, whole-service withdrawal and saved requests for future inventory retain their existing safeguards. Photo captions and sent templates are included in subsequent AI conversation context.

Offers and manual campaign snapshots now store a seller WhatsApp number and an optional public HTTPS photo URL. New offers require a seller contact; an existing verified connection belonging to that business can supply it. Existing offers were backfilled only from their own verified business connections. Offer replies include the seller number and click-to-chat link. A photo with a caption is sent when the caption fits WhatsApp's 1,024-character limit; longer replies and approved text templates include the photo link. No image upload service or media-template editor was added. The UI accepts a public JPEG/PNG link (up to 5 MB at Meta); Meta must be able to retrieve it.

Verification: 71 automated checks passed, plus ESLint, TypeScript and diff checks. An isolated signed-webhook test covers business inquiry, duplicate invitation prevention, central-only consent, AI analysis, a central photo offer with seller contact, and global deletion. Separate checks cover cross-business MORE/STOP, central-window template approval, privacy boundaries and future-offer requests. AI and Meta responses in these tests are mocked. Chrome saved and edited a local demo offer, then verified the authenticated production catalog and new contact/photo fields with no browser errors. Live health and automation recovery returned 200, anonymous catalog access returned 401, and the existing Meta credential lookup returned 200. The runtime error sample contained only the existing PostgreSQL SSL-mode deprecation warning.

Production currently has one central WhatsApp sender, no separate connected business sender, three active offers with seller contacts, no uploaded/photo-linked offers, and two customers with accepted consent and complete analysis. A live cross-business invitation and real photo receipt remain unverified until a second business sender and an actual offer photo are supplied. No synthetic production offers or customers were created, and this release did not replay previously sent offers. Screenshot: `artifacts/central-consent-offer-form.png` (local, ignored).

## Keep unmatched requests open, 2026-10-09

Application commit `0e3973a` is pushed to GitHub and deployed at https://datamine-lilac.vercel.app as `dpl_4b6XdkFoBmiFZds4h14iCCkgEdSY`. The production build and TypeScript compilation passed. Migration `0012_waiting_offer_requests` is applied to local and production PostgreSQL.

An explicit offer request with a known topic now remains open when no suitable unseen offer exists. The customer receives one acknowledgement explaining that Datamine will send one matching offer when available. Saving, editing or publishing an offer wakes saved requests across participating businesses. A 15-minute recovery check covers missed wakes; unchanged inventory does not incur another AI call. The saved topic and original chat context survive later unrelated messages. One accepted offer consumes the request, so further catalog changes cannot generate another delivery without MORE. Topic stops cancel the corresponding waiting permission; global withdrawal deletes it.

After the central WhatsApp reply window closes, the selected offer is submitted as a complete marketing template through the existing Meta integration. Pending approval is checked automatically before delivery. Rejected templates, unsupported content/languages and exhausted preparation failures remain unsent and require correction; the request is retained. The current simple template adapter supports complete text up to 1024 characters. Consent, current offer availability and profile changes are rechecked before sending. Changing a pending offer wakes matching again. An uncertain provider submission is never automatically replayed.

Verification: all 68 automated checks passed, including a new-business offer fulfilling a saved request once, later topic changes, concurrent workers, unchanged-catalog AI suppression, unrelated offers, topic/global stops and approved-template delivery outside 24 hours. These tests use isolated PostgreSQL with mocked AI and Meta. ESLint and TypeScript passed. The production check caught PostgreSQL microseconds being truncated through JavaScript Date in the historical-message cutoff; this was fixed by comparing database timestamps directly and covered by the 28 recommendation checks rerun after the correction.

The real customer's existing `more laptop offers` request (number ending 8010) was preserved after checking consent, latest inbound request, prior delivery timing and the absence of an offer submission. Its old acknowledgement remains in message history with a distinct idempotency key. The deployed worker used real Haiku to check the catalog and left the request in `waiting`, with its catalogue hash recorded, a future recovery time and no new outbound message. Production health returned 200 with PostgreSQL connected. No synthetic offers were added to production. A future live business offer is still needed to demonstrate actual fulfillment of this waiting request; the isolated tests verified that delivery sequence.

## Direct offer requests and topic changes, 2026-10-09

Application commit `f9ffb13` is pushed to GitHub and deployed at https://datamine-lilac.vercel.app as `dpl_EUZEcBeTV7PRtfJoiwsYtcVMbkMK`. The production build and TypeScript compilation passed. No database migration is required.

Explicit requests for offers now receive one suitable unseen offer without requiring repeated interest. A small AI intent check distinguishes these requests from unsolicited recommendations, which still require repeated interest in the same topic. Follow-ups use the latest subject, so a camera question after a laptop offer followed by MORE stays about cameras. A focused AI evidence check rejects unrelated product requests as proof of repeated interest. When no suitable unseen offer is available, the customer receives a short localized reply instead of silence. Topics remain AI-generated.

Verification: all 65 automated tests, ESLint, TypeScript and diff checks passed. An isolated PostgreSQL flow using real Haiku passed direct requests, laptop-to-camera changes, MORE, two separate customers and duplicate prevention with 14 AI calls and five simulated provider sends. Consent, topic stops, expiry, freshness and uncertain-send guards remain covered.

After deployment, only the two latest unsent no-match jobs were requeued after checking their latest inbound message, accepted consent, active profile and absence of a provider submission. The customer ending 8010 received a provider-accepted camera offer, with the latest observed callback reporting Sent. The customer ending 3220 had already read the camera offer and received a Delivered reply stating there were no more matching camera offers. Previously accepted offers were not replayed. Chrome confirmed the separate histories and responses in the live inbox. The recent error-log sample contained only the existing PostgreSQL SSL-mode deprecation warning.

Chat context currently uses up to 30 recent messages with input-length limits, saved AI insights and separate offer/consent records. It does not yet implement rolling-summary compaction; the saved summary does not replace older messages in subsequent analysis prompts.

## Contextual offer matching and permanent WhatsApp credential, 2026-10-09

Application commit `bb82cd2` is pushed to GitHub and deployed to https://datamine-lilac.vercel.app as `dpl_24i9gzZX3uemYoMVYVtgvEejBefS`. The production build and TypeScript compilation passed.

The central WhatsApp connection now uses the existing Meta system user's encrypted token. Meta's debugger confirmed `SYSTEM_USER`, the expected app, `expires_at: 0` and `data_access_expires_at: 0`; the phone lookup succeeded. The token has no scheduled expiry, but can still be revoked. The previously rejected laptop recommendation was recovered only after verifying it had no provider message ID or callback, and its replacement received a Read receipt. The failed attempt remains in message history.

The camera customer's messages and offer history were separate from the laptop customer's records. A generic follow-up initially returned no match; a first recovery then selected that same customer's older laptop interest. The correction supplies the current AI-analyzed subject and requires its source message in the recommendation's evidence, so older interests cannot independently justify a newer follow-up. First-offer requests are distinguished from MORE, topics remain dynamic, and no-match decisions retain the AI reason.

Verification: 23 recommendation checks passed, including separate phone histories, contextual requests, changed topics, one offer then MORE, consent, stops, expiry and duplicate protection. ESLint, TypeScript and diff checks passed. Two read-only replays through real Haiku selected the camera offer with exact camera/follow-up quotes, both before and after accounting for the intervening laptop delivery. These replays did not send messages. The final live automatic-flow check is awaiting a fresh message from the camera test customer; the already-delivered laptop request was not replayed or rewritten.

## Automatic offer catalog and central WhatsApp, 2026-10-09

Application commit `a994335` is pushed to GitHub and deployed at https://datamine-lilac.vercel.app as `dpl_4JegFykMZkT4npuN43xyUwWw41b2`. The Vercel production build and TypeScript compilation succeeded. Migrations 0010 and 0011 are applied locally and in production.

The new **Offers** page saves each business's offer title, description, price/currency, language and expiry. Saving makes it immediately available to automatic recommendations without a second publish step. Catalog entries are distinct from manual bulk campaigns. **Create campaign** copies the saved offer details; subsequent catalog edits preserve that campaign's snapshot. Archived or expired catalog offers cannot be recommended or delivered through linked queued campaigns. AI categories remain dynamic.

The existing verified demo sender **+1 555-632-3113** is now **Datamine WhatsApp**, the single central connection for consent, recommendations and campaign delivery. The customer gives consent once in that chat, and MORE/STOP replies remain there. Suppliers can publish without a WhatsApp API connection. Offers from every business, including the central workspace, are eligible; seller identity appears in the message. Businesses cannot browse central conversations or another business's templates. Manual campaign audiences remain scoped to the business's own CRM customers.

Verification:

- All 61 automated tests, ESLint, TypeScript and diff checks passed. After adding a final expiry-before-delivery guard, the 12 campaign checks passed again.
- Authenticated HTTP tests cover catalog permissions, canonical price snapshots, immediate publication, edit/archive/restore, expiry rollback and hidden internal catalog entries. Recommendation tests cover a saved offer from a supplier without WhatsApp, one match then MORE, topic/global stops and locks during provider submission. Meta and AI are mocked in these automated tests.
- Chrome on the local authenticated application saved a temporary offer, confirmed its automatic publication in PostgreSQL, created a separate manual campaign from the saved price, and archived the offer. Only those local verification records were removed afterward.
- Production build is READY. Live PostgreSQL health returned 200; anonymous catalog access returned 401; Arabic and Sorani demo routes returned 200. Chrome verified the authenticated live Offers form, Arabic Offers page and central-number selection. The Meta credential check returned 200 for the expected sender.
- The live error-log scan showed only the existing PostgreSQL SSL-mode deprecation warning. No synthetic offers or customers were added to production, and no new WhatsApp message was sent as part of this release's checks.

To demonstrate: save a real offer with a future expiry, then send repeated relevant requests to the central demo number from a consenting controlled customer. AI sends one best eligible match during the central number's open reply window; MORE requests another unseen match. Saving alone does not broadcast. Meta templates remain required for manual sends outside the central 24-hour reply window.

This release supersedes the per-business sender behavior described in the historical entries below.

## Smart offers release, 2026-10-09

Application commit `fbcc381` is deployed to https://datamine-lilac.vercel.app as production deployment `dpl_BRqtQ12133p9WVYEpfLYSCYFqWY3`. The Vercel production build and TypeScript compilation succeeded. Migration `0009_smart_offer_flow.sql` is applied to local and production databases.

The central administrator can see every business and create business-owner login invitations from Businesses. Each business sees its own CRM contacts and campaign audience, and sends through its own WhatsApp connection. Consenting customers are enrolled once. Existing offers remain private until the business enables Recommend across Datamine and supplies an expiry date.

Automatic recommendations compare published offers from other businesses after repeated interest, send one suitable offer, and wait for MORE. STOP OFFER blocks the latest offered topic; named topic stops are interpreted by AI. Other topics remain available. STOP, STOP ALL, and DELETE MY DATA remove saved chats, profiles, recommendation history, and queued offers. A minimal consent-choice record blocks later collection. Manual business campaigns do not have the one-automatic-offer limit.

Verification completed:

- ESLint, TypeScript, and all 53 automated checks pass. Tests cover real authenticated HTTP sessions, business isolation, invitations, consent, stale preferences, sender windows, publication expiry, queue recovery, duplicate prevention, topic stops, and deletion.
- A fresh isolated flow used actual `anthropic/claude-haiku-5.5` through OpenRouter: 13 AI calls and three recommendations. It selected the cheaper equivalent bicycle offer from another business, excluded an own-business offer, waited for MORE, preserved other interests after a topic stop, then deleted the test customer's data after STOP ALL. Meta delivery was mocked for this flow; the in-memory database was destroyed afterward.
- Production health returned 200 with PostgreSQL connected. English, Arabic, and Sorani entry routes returned 200; anonymous customer API access returned 401.
- The deployed managed queue reprocessed the existing consenting chat automatically to analysis version 5, with no analysis error and no outstanding profile hold. With one business and no published network offers, the recommendation job correctly finished with no match.
- The expired demo Meta token was refreshed under the existing permissions and stored encrypted. Meta's credential check returned 200. One message sent through the live Datamine browser inbox was accepted and its real Meta delivery callback marked it Delivered in PostgreSQL and the UI.
- The production error-log scan found only the existing PostgreSQL driver's SSL-mode deprecation warnings, not an application processing failure.

The live workspace still has one business, one customer profile, and two existing offers. No synthetic cross-business customers or offers were added to production, and the real customer's data was not deleted. A live cross-business demonstration needs a second connected business with a published offer. The isolated real-AI result is not a benchmark of model accuracy across every business or language. The refreshed Meta credential remains a temporary demo token.

The sections below record earlier releases and their results; the current release details above supersede their pending-test notes and former central-sender behavior.

## Single WhatsApp consent and automatic audiences

The flower offer had no audience because the real chat had AI-detected flower interest but no enrolled profile. One WhatsApp consent now covers collection, AI analysis and enrollment. First contact queues a notice; YES creates an automatic profile and resumes analysis. NO/STOP removes saved chat/profile data and blocks future collection. Unanswered chats stay held without AI or offers. Minimal consent records preserve the choice across businesses. AI-derived interests refresh existing offer audiences; matching still uses Haiku, without a business-specific taxonomy. The inbox replaces the second enrollment action with consent status.

Verified locally: all 13 checks, both HTTP smoke suites and a production build. The new integration test covers first notice deduplication, no pre-consent AI, YES → dynamic flower interest → existing-offer match, no repeated consent across businesses, first-message YES handling, NO suppression, and STOP during an in-flight AI request without recreating deleted data. Provider calls in automated tests are mocked. Source `265fd4f` is deployed as `dpl_HakfCCSmTniyhDbFXgmP5voK7Dap`; GitHub CI run `37818267301` passed. The real controlled contact has one pending consent record. The initial queue send was rejected; a retry of that definitively failed notice was accepted and its signed Meta delivery callback confirmed delivery. The cause of the first rejection was not exposed by the current send adapter. The live inbox shows pending WhatsApp consent. Actual YES → profile → flower audience verification remains pending the customer reply; no consent was fabricated and no campaign was sent.


## Vercel live; WhatsApp and OpenRouter Haiku verified

The demo is live at **https://datamine-lilac.vercel.app**; sample inbox: **https://datamine-lilac.vercel.app/en/demo/inbox**. Production deployment `dpl_HakfCCSmTniyhDbFXgmP5voK7Dap` serves source commit `265fd4f` from GitHub `main`. Its cloud build succeeded and GitHub CI passed (run `37818267301`).

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
