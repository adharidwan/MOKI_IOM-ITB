# Overall Product Task List

## Purpose

This document tracks the overall product backlog status after comparing the stated product backlog with the current codebase.

It is intended to stay persistent as a high-level product and engineering checklist.

## Product Scope

The product is an integrated communication management system for an organization.

Main capabilities:

- WhatsApp-integrated ticketing/helpdesk.
- WhatsApp blast message delivery.
- Contact and segment management.
- Published content recording.
- Pre-content asset/resource/link management.
- Operational monitoring dashboard.

## Backlog Reality Check

| PB | Product Backlog | Current Status | Notes |
|---|---|---:|---|
| PB-1 | Import WA recipient contacts from CSV | Mostly done | `/contacts` and CSV import flow exist. Bulk upsert by phone number is implemented. |
| PB-2 | Group contacts into segments | Mostly done | Contacts use `group_names`; `/group` directory exists. This is array-based, not normalized many-to-many. |
| PB-3 | Add published content metadata | Partially done | `/content-record` stores title, platform, upload date, link, source post id, thumbnail. Missing richer metadata. |
| PB-4 | Auto-fill metadata from content link | Partially done | Link scraping exists. Scraper reliability and platform coverage still need validation. |
| PB-5 | Edit/delete content metadata | Half done | Delete exists. Edit is not a clear first-class flow; current behavior is closer to upsert by link. |
| PB-6 | Search/filter content | Weak partial | Local keyword search exists. Missing proper platform/date/category filter and pagination. |
| PB-7 | Add tags/categories to content | Not done | No content tag/category fields or tables. |
| PB-8 | Save draft content with supporting assets | Not done | No draft status, attachment/resource table, upload flow, or asset workflow. |
| PB-9 | Create WhatsApp blast with variable template | Variables done, templates not done | Variable rendering exists. Saved template CRUD does not exist. |
| PB-10 | Schedule WA blast | Not done | Blast is queued immediately. No scheduler/campaign model. |
| PB-11 | Dashboard overview for all channels | Partially done | `/whatsapp` has operational WA dashboard. Not yet holistic for Instagram, YouTube, website, content. |
| PB-12 | Incoming WA creates helpdesk ticket | Done with caveat | Bot creates tickets via `!make_ticket`; arbitrary first messages do not automatically become tickets. |
| PB-13 | Staff can read, reply, and mark tickets | Mostly done | Ticket list/detail, replies, close action, and outbound WA reply queue exist. UI can be improved. |

## Overall Status By Module

### Contacts

Status: strong foundation.

Current capabilities:

- Import contacts from CSV.
- Add contact manually.
- Search and sort contacts.
- Assign contacts to groups.
- Bulk delete contacts.

Known gaps:

- Need validation polish for imported CSV format.
- Group model is array-based and may become harder to maintain if requirements grow.

### Groups

Status: strong foundation.

Current capabilities:

- Browse groups.
- Browse group members.
- Create group with first member.
- Add member to group.
- Search and sort group/member directory.

Known gaps:

- No normalized `contact_groups` and `contact_group_members` tables.
- No explicit group metadata beyond group name.

### Blast Message

Status: functional but missing template and schedule features.

Current capabilities:

- Send blast to selected contacts.
- Send blast to selected groups.
- Send blast from uploaded CSV.
- Send blast to manual recipients.
- Save manual/CSV recipients into a group.
- Insert and render variables.
- Queue messages into outbound ledger.
- Track outbound messages with overlay/dashboard support.

Known gaps:

- No saved template library.
- No scheduled blast.
- No persistent campaign-level history table.
- Blast/API outbound instance assignment still defaults to the `default` WA instance.

### Ticketing And Helpdesk

Status: mostly functional.

Current capabilities:

- WhatsApp bot receives messages.
- Valid `!make_ticket` messages create tickets.
- Replies to active tickets are appended as customer replies.
- Staff can browse tickets.
- Staff can open ticket detail.
- Staff can reply to WhatsApp tickets.
- Staff can close tickets.
- Outbound staff replies are queued and tracked.

Known gaps:

- PB-12 wording says every incoming WA message creates a ticket, but current implementation requires command format for new tickets.
- Ticket UI can be improved for production helpdesk usage.
- Need clearer failed reply visibility.

### WhatsApp Operations

Status: advanced foundation, incomplete admin management.

Current capabilities:

- `whatsapp_instances` table exists.
- Runtime state is namespaced by instance ID in Redis.
- Dashboard shows instance status, QR, events, queue summary, and outbound summary.
- Outbound messages store `whatsapp_instance_id`.
- Bot supports env-based instance ID and label.

Known gaps:

- No admin create/update/disable instance APIs yet.
- No admin add/remove bot worker controls yet.
- Blast/API outbound messages are not distributed across instances yet.
- Bot auth/session path must be isolated by instance before multiple workers are safe.

### Content Recording

Status: proof of concept.

Current capabilities:

- Add content record manually.
- Paste link and auto-fill some metadata.
- Delete content record.
- Search locally.
- Export selected scraped content into content recording.

Known gaps:

- No category/tag support.
- No description field.
- No clear edit existing record workflow.
- No server-side filtering/pagination.
- No content status or lifecycle.

### Pre-Content Management

Status: not implemented as a real module.

Expected capability:

- Store assets, links, documents, references, and resources before publication.
- Prevent resources from being scattered across WhatsApp groups.
- Attach assets/resources to a draft or planned content item.

Known gaps:

- No resource table.
- No upload/storage integration for assets.
- No URL/resource metadata form.
- No draft content model.
- No relationship between resources and content records.

### Root Dashboard

Status: needs production rework.

Current capabilities:

- Links to several modules.

Known gaps:

- Visual quality is behind `/contacts`, `/group`, `/blastmessage`, and `/ticket`.
- It feels like a temporary menu page.
- It does not yet communicate the product as one integrated command center.

## Recommended Product Roadmap

### Phase 1: Demo-Ready Core

Goal: make the existing strongest features feel integrated and production-ready.

Tasks:

- Complete multi-WhatsApp instance safety and distribution.
- Add WhatsApp instance management controls.
- Add saved blast templates.
- Rework root `/` into a production dashboard.
- Improve `/whatsapp` status hierarchy and controls.
- Improve ticket detail readability and reply delivery visibility.

### Phase 2: Complete Backlog Gaps

Goal: close explicit product backlog gaps.

Tasks:

- Implement scheduled blast.
- Add content tags/categories.
- Add proper content filters.
- Add clear edit flow for content records.
- Decide whether arbitrary incoming WA messages should auto-create tickets or continue using command-based creation.

### Phase 3: Pre-Content Management

Goal: turn the new pre-content requirement into a real module.

Tasks:

- Define resource types: URL, image, document, video, note, external drive link.
- Add `content_resources` or equivalent table.
- Add upload/storage path if files are required.
- Add draft/planned content table.
- Link resources to draft content.
- Allow converting draft/planned content to published content record.

### Phase 4: Holistic Monitoring

Goal: make PB-11 truly cover all communication channels.

Tasks:

- Add content/channel overview metrics.
- Add recent published content summary.
- Add planned/draft content summary after pre-content exists.
- Add WhatsApp queue/ticket health summary.
- Add per-channel operational status if APIs are available.

## Highest-Risk Items

- Multi-bot WhatsApp auth/session conflict if multiple workers use the same `.wwebjs_auth` path.
- Blast/API outbound messages currently default to one WhatsApp instance, so multiple bots do not automatically distribute load yet.
- Scheduled blast requires more than a UI date picker; it needs a durable scheduling model and worker behavior.
- Pre-content management is currently a product concept, not an implemented schema/module.
- PB-12 wording may conflict with command-based ticket creation behavior.

## Recommended Next Decision Points

1. Should arbitrary first WhatsApp messages create tickets automatically, or should ticket creation remain command-based?
2. Should admin instance removal be hard delete, soft disable, or both?
3. Should blast scheduling be campaign-based with history, or simple delayed queueing?
4. Should pre-content assets include actual uploaded files, or only URLs/resources for the first version?
5. Should `/` become the main command center or redirect to `/whatsapp`?
