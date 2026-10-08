# Datamine implementation plan

Updated 8 October 2026. Current phase: Phase 1 implemented and locally tested; Render deployment and live agency onboarding pending external setup. See DELIVERY.md for verified status and remaining work.

Build a live travel-agency pilot on Render with PostgreSQL, multiple existing WhatsApp Cloud API accounts, and English, Arabic, and Kurdish interfaces. Claude Haiku 5.5 is the sole AI model for message classification, information extraction, and conversation analysis. The initial pilot targets three agencies and Datamine's own offer-sending account.

Kurdish is provisionally Sorani. Arabic and Sorani interfaces use right-to-left layouts. Interface language and each customer's preferred messaging language are stored separately.

## Application stack

| Component | Selected technology | Responsibility |
| --- | --- | --- |
| Web application and backend | Next.js and TypeScript | Staff workspaces, customer pages, API endpoints, and webhooks |
| Interface | Tailwind CSS and shadcn/ui | Inbox, customer records, filters, forms, and dashboards |
| Localization | next-intl | English, Arabic, and Sorani translations and locale formatting |
| Database | Render PostgreSQL | Operational records, message history, customer profiles, and queue storage |
| Database access | Drizzle ORM and node-postgres | Queries, connection pooling, and versioned migrations |
| Staff authentication | Better Auth | Login and sessions, with application-enforced agency memberships |
| Background jobs | pg-boss in a Render Background Worker | Message analysis, reminders, campaign processing, and retryable work |
| AI provider | Anthropic Claude API | All AI classification, extraction, and conversation analysis |
| AI model | `claude-haiku-5-5` | Structured results validated against the application schema |
| Messaging | Meta WhatsApp Cloud API | Agency conversations, Datamine offers, and delivery callbacks |

Deploy one Next.js web service, one background worker, and one PostgreSQL database. The web service and worker share a repository and connect to the database using Render's internal connection URL in the same region. Plan for paid instances for the live pilot. Store application secrets in Render environment variables and encrypt agency connection credentials at rest.

## Claude Haiku 5.5 integration

Use the Anthropic Messages API through a server-side client. Configure `ANTHROPIC_API_KEY` and set `ANTHROPIC_MODEL=claude-haiku-5-5`. All AI jobs use this model, including any retry at a different effort level.

Request structured JSON and validate it with Zod before storing accepted results. Start the evaluation with low effort and thinking disabled for short extraction tasks. Compare with medium effort on the same Haiku model before choosing production settings. Handle refusals, empty or truncated output, invalid fields, timeouts, and rate limits explicitly. The model has no database, messaging, or browsing tools in this analysis workflow.

Anthropic documents Haiku 5.5's effort settings and structured output behavior in its [model-specific prompting guide](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5) and [structured outputs documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). The API model identifier is documented in the [Haiku 5.5 announcement](https://www.anthropic.com/claude-haiku-5-5).

## Classification and conversation analysis

Combine classification and extraction in one analysis call for a relevant message or short burst of messages. Provide new messages, limited relevant conversation context, the existing structured inquiry, source message identifiers, and the message timestamp and time zone. Process customer text as evidence, never as instructions authorizing application actions.

| Analysis output | Planned fields and behavior |
| --- | --- |
| Message language | English, Arabic, Sorani, mixed, other, or unknown; allow correction |
| Inquiry intent | Price inquiry, availability inquiry, booking request, booking change request, cancellation request, support, greeting, other, or unclear |
| Services | Multiple applicable labels: flight, visa, hotel, transfer, package, or other |
| Travel details | Departure, destination, travel date or range, passenger count, and explicitly stated budget and currency |
| Customer updates | Corrections to previous details and newly expressed preferences, with supporting evidence |
| Conversation progress | Summary, unanswered questions, suggested next action, and whether customer or staff input appears to be pending |
| Customer control signals | Possible stop-offers, deletion, or details-correction requests for the dedicated handling workflow |
| Review information | Missing fields, contradictions, ambiguous dates, and reasons for staff review |

Each extracted field must reference the source message and supporting text. Missing facts remain null. Resolve city aliases to a maintained city catalogue in application code and preserve the original wording. Keep date arithmetic and date-range comparisons in code; request confirmation for unresolved interpretations.

Use separate inquiries when one customer discusses different trips. Preserve corrections and field history instead of silently overwriting unrelated trips. Names and phone identifiers come from verified records or messaging metadata; AI suggestions do not establish identity. An inquiry or booking request does not establish a confirmed booking.

Model-generated uncertainty indicators are review signals, not calibrated probabilities. Classification thresholds and any automatic state suggestions must be evaluated on labelled examples before being enabled.

## Message tracking and processing

WhatsApp events and application actions establish message direction, sender, timestamps, delivery state, and staff actions. Haiku adds the semantic interpretation and conversation summary.

1. Verify each webhook signature and resolve the connected agency account using its provider identifiers.
2. Save the incoming message or status event, then durably schedule processing before acknowledging successful ingestion. Deduplicate provider events so webhook retries do not create duplicate records or jobs.
3. Display the saved message immediately. Keep analysis status separate as pending, processing, complete, failed, or needs review so AI availability does not prevent staff from reading or replying.
4. Serialize analysis per conversation or use a revision guard. Briefly group rapid message bursts to reduce repeated requests. An older analysis result must never overwrite a newer correction or staff edit.
5. Validate Haiku's proposed update, attach provenance, and apply permitted changes transactionally. Persist the model identifier, prompt and schema versions, input message references, token usage, latency, and result status.
6. Update conversation summaries and follow-up suggestions in the staff workspace. Staff remain responsible for replies and confirmed workflow transitions during the pilot.

Outbound messages use durable jobs. Track queued, submitting, provider accepted, delivered, read when reported, failed, cancelled before submission, and uncertain submission states. Provider status events may arrive late or out of order; retain event history without regressing established delivery progress. Absence of a read receipt means unknown.

Use unique outbound request identifiers and provider message identifiers to prevent duplicate processing. Retry known transient failures with backoff. An API timeout after a possible send is an uncertain submission and must be reconciled or reviewed before resending. Queue retries alone do not guarantee exactly-once external delivery.

## Agency and shared customer records

Keep agency contacts and conversations separate from Datamine's shared profiles. Scope every agency query by server-verified membership. Each agency connection stores its account identifiers, credential reference, connection health, and webhook configuration. Confirm access to existing Cloud API assets and webhook subscriptions during onboarding.

Link contacts to a shared profile only after verified customer enrollment. Record what the customer agreed to, when, through which channel, and the notice version. Share the enrolled travel-interest fields required by Datamine; agency conversation histories remain private to the agency.

| Data group | Main records |
| --- | --- |
| Access | Users, sessions, agencies, memberships |
| WhatsApp connections | Account identifiers, encrypted credentials, connection health |
| Messages | Conversations, messages, provider events, outbound attempts |
| AI analysis | Analysis runs, message classifications, extracted fields, field history, summaries |
| Agency CRM | Contacts, inquiries, assignments, notes, reminders |
| Shared service | Verified profiles, enrollment events, contact links, interests |
| Campaigns | Offers, campaigns, recipients, delivery attempts |
| Customer controls | Preferences, suppression state, deletion requests, audit events |

Haiku cannot grant enrollment, verify ownership, merge identities, establish bookings, or override staff access rules. Those operations require explicit application workflows.

## Offers and customer controls

Agencies submit offers; Datamine reviews them and selects recipients through database filters for route, service, dates, recent interest, and active enrollment. Haiku may assist with interpreting offer text, but application rules determine final eligibility.

Explicit stop buttons and recognized opt-out commands update suppression immediately. Haiku also identifies natural-language opt-out requests in all supported languages. Possible opt-out messages place offers on hold pending resolution; AI failures must not silently clear that hold. Recheck current suppression and enrollment immediately before each campaign submission. Cancel sends not yet submitted; already accepted external sends cannot be assumed recallable.

Deletion removes the active shared profile and linked campaign data through a defined workflow. Document backup retention separately and prevent later synchronization from recreating a deleted profile without fresh enrollment. Campaign delivery uses Datamine's account; agency replies use the relevant agency account. Approved template and customer-service-window requirements are enforced per sender.

## Pilot build order

1. **Foundation and live account routing:** deploy Render services, database migrations, staff login, agency roles, localization framework, and the existing WhatsApp connections. Demonstrate correct inbox and sending-number routing for all pilot agencies.
2. **Agency CRM and message history:** deliver inboxes, assignments, customer records, inquiry status, notes, reminders, and accurate provider delivery tracking.
3. **Haiku analysis:** implement the structured schema, combined classification and extraction job, conversation summaries, correction history, review states, and usage measurements.
4. **Enrollment and shared profiles:** implement customer identity verification, explicit enrollment, profile linking, multilingual preferences, and private agency boundaries.
5. **Offers and campaigns:** add offer submission, Datamine review, audience matching, template selection, durable delivery, and customer controls.
6. **Pilot acceptance:** exercise the complete inquiry-to-offer journey using controlled live recipients, review translations, and test failures and recovery.

Initial scope is text messages and approved templates. Unsupported media must be visible as such rather than silently ignored. Media handling, voice transcription, billing, and advanced analytics follow the working pilot.

## Acceptance criteria

- Every AI request uses `claude-haiku-5-5`; no alternate model or provider is selected automatically.
- The complete interface works in English, Arabic, and Sorani, including forms, validation, customer controls, and right-to-left layouts.
- Test approximately 200 to 300 labelled inquiries across the three languages, mixed scripts, misspellings, missing context, negation, corrections, multiple services, and ambiguous dates. Report accuracy separately by language and field, plus latency and cost.
- One customer asking about flights and visas receives both service labels; unknown facts remain unset and unsupported booking claims are not accepted.
- Agency users cannot read or alter another agency's private messages or contacts.
- Replayed webhooks do not duplicate messages, status events, or analysis jobs. Out-of-order analysis cannot replace newer data.
- Database, provider, or AI failures leave visible, recoverable states; uncertain sends are not blindly retried.
- Enrollment and suppression checks apply immediately before sending, including queued campaigns. No AI label grants permission to send offers.
- Messages remain available to staff when Haiku is unavailable, and all changes survive service restarts and redeployments.
