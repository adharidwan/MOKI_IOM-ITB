# Content Recording Production Plan

## Purpose

This document defines the production-ready plan for improving `/content-record`.

The page should become the main content management surface for recorded/published content. The current name "Content Recording" is implementation-oriented, so the user-facing product name should move toward **Content Library** or **Content Management**.

This plan focuses only on `/content-record`. `/scrape` remains a secondary bulk-import workflow and is not the main focus of this document.

## Product Goal

Turn `/content-record` from a proof-of-concept metadata form into a production-ready content library where editors can:

- Record published content.
- Auto-fill metadata from a pasted link.
- Correct scraped metadata manually.
- Store the original caption/text separately from the title.
- Add personal/internal tags.
- Search and filter content quickly.
- View content previews with accurate thumbnails.
- Edit and delete records safely.

## Current State

Current route:

- `/content-record`

Current main files:

- `app/content-record/page.tsx`
- `app/content-record/ContentRecordingWorkspace.tsx`
- `app/content-record/actions.ts`
- `app/lib/api.ts`
- `app/lib/types.ts`
- `app/lib/scrape-content-link.ts`

Current database behavior:

- Content records are stored in `content_recordings`.
- Current known fields are `title`, `platform`, `upload_date`, `link`, `source_post_id`, `thumbnail_url`, `created_at`, and `updated_at`.

Current limitations:

- `title` often contains caption-like text for Instagram/X.
- No dedicated `caption` field.
- No internal `description` or notes field.
- No tag/category model.
- No clear edit flow for existing records.
- Search is local and basic.
- Filtering by platform/date/tag/category is not production-ready.
- Thumbnail presentation should preserve original aspect ratio.
- UI still feels like a PoC compared to `/contacts`, `/group`, `/blastmessage`, and `/ticket`.

## Product Naming

Recommended user-facing name:

- **Content Library**

Alternative:

- **Content Management**

Recommendation:

- Use **Content Library** for `/content-record` because the page stores published content records and references.
- Keep route `/content-record` for now to avoid route churn.
- Update visible copy, page title, navigation label, and CTA text.

## Content Model Direction

### Title vs Caption

Separate title and caption.

Rules:

- `title` is a short editor-facing label.
- `caption` is the original post caption/text/description from the platform.
- Users should be able to edit both.
- Scraped data should not force long captions into `title` when `caption` is available.

Suggested behavior by platform:

| Platform | Title | Caption |
|---|---|---|
| YouTube | Video title | Video description if available later |
| Instagram | Short generated/manual title | Full post caption |
| X | Short generated/manual title | Full tweet text |
| Website | Page title or OG title | OG/meta description |

### Thumbnail

Thumbnail should preserve original ratio.

Implementation rule:

- Use `object-fit: contain` for detailed preview.
- Avoid cropping important visual context.
- Card/list thumbnails can use a fixed preview box, but the image itself should not be cropped.

### Tags

Use a many-to-many tag schema.

Reason:

- One content record can have many tags.
- One tag can apply to many records.
- Tags should be reusable for filtering.
- This is cleaner than `tags text[]` once UI filtering and management are needed.

## Proposed Schema Changes

### Content Record Additions

Add fields to `content_recordings`:

- `caption text`
- `description text`
- `content_type text`

Notes:

- `caption` stores original platform text.
- `description` stores internal/editor notes.
- `content_type` can store values such as `video`, `short`, `reel`, `post`, `tweet`, `article`, or `other`.

### Tag Tables

Create `content_tags`:

- `id uuid primary key default gen_random_uuid()`
- `name text not null unique`
- `created_at timestamptz not null default timezone('utc', now())`

Create `content_recording_tags`:

- `content_recording_id uuid not null references public.content_recordings(id) on delete cascade`
- `tag_id uuid not null references public.content_tags(id) on delete cascade`
- `created_at timestamptz not null default timezone('utc', now())`
- primary key on `(content_recording_id, tag_id)`

### Future Schema Fields

These are useful later but should not block the first production pass:

- `status text` for published/draft/archived.
- `owner text` or `created_by text`.
- `campaign text` or a campaign relation.
- `metrics jsonb` for imported analytics.
- `platform_account text` for source account/channel.

## Proposed UI Structure

### Design Reference

The `/content-record` redesign must follow:

- `docs/GUIDELINES.md` for product character, dashboard density, tables, filters, modals, and responsive behavior.
- `app/components/AdminFeatureShell.tsx` for the shared admin shell.
- `app/lib/adminPalette.ts` for the blue/slate visual system.
- `/contacts`, `/group`, `/blastmessage`, and `/ticket` as the in-repo production-ready UI references.

The page should feel institutional, calm, operational, and data-first. Avoid the current PoC feeling where the form and result list compete equally for attention.

### Interface Principle

The primary job of `/content-record` is not data entry. The primary job is helping an editor understand and manage the content library quickly.

Therefore:

- The list/library view should be the default focus.
- Add/edit should move into a drawer or modal.
- Search and filters should be prominent.
- Metadata quality should be visible at a glance.
- Destructive actions should be confirmed.

### Page Header

Title:

- `Content Library`

Description:

- Explain that this page stores published content references from YouTube, Instagram, X, website, and other channels.

Primary actions:

- `Add Content`
- `Import from Channel`

Behavior:

- `Add Content` opens a drawer/modal for manual entry.
- `Import from Channel` links to `/scrape` as a secondary workflow.

Recommended header layout:

- Use `AdminFeatureShell` with `badge="Content Library"`.
- Page title: `Content Library`.
- Description: `Kelola arsip konten yang sudah dipublikasikan dari YouTube, Instagram, X, website, dan kanal lain dalam satu tempat.`
- Right-side actions use the same button style as `/contacts` and `/ticket`.

Recommended actions:

- Primary contained button: `Add Content`.
- Secondary outlined button: `Import from Channel`.

Do not put the full content form directly under the page title in the default state.

### Overview Metrics

Show small metrics at the top:

- Total records.
- Platforms represented.
- Records this month.
- Untagged records.

Keep these lightweight and derived from available data.

Recommended visual pattern:

- Use the same compact `MetricTile` style already used in `/contacts`, `/group`, and `/ticket`.
- Wrap metrics in a white `Paper` with subtle border, `borderRadius: 2.5`, and no heavy shadow.
- Keep labels uppercase and small.
- Keep values dark blue/slate and scannable.

Recommended first metrics:

- `Total records`: count of all content records.
- `Platforms`: unique platform count.
- `This month`: records with `upload_date` in the current month.
- `Missing tags`: records with no tags after tag schema exists.

Until tags exist, use:

- `Missing thumbnail`: records with no `thumbnail_url`.

These metrics are operational. They tell the user what needs cleanup, not just decorative totals.

### Search And Filters

Production filters:

- Keyword search.
- Platform filter.
- Date range filter.
- Tag filter.
- Content type filter.

First implementation can support:

- Keyword search.
- Platform filter.
- Tag filter after schema is added.

Date range can be added after the main flow is stable.

Recommended visual pattern:

- Use a toolbar card above the list, similar to search/filter areas in mature pages.
- Search field should include a leading search icon.
- Filters should wrap on smaller screens instead of overflowing.
- Active filters should be readable through chips or selected values.

First UI controls:

- Keyword search input.
- Platform select: `All`, `YouTube`, `Instagram`, `X`, `Website`.
- Content type select after schema exists: `All`, `Video`, `Short`, `Reel`, `Post`, `Tweet`, `Article`, `Other`.
- Tag selector after tag schema exists.

Second-pass controls:

- Date range.
- Missing metadata quick filter: `Missing thumbnail`, `Missing caption`, `Untagged`.

### Main Content List

Recommended layout:

- Desktop: table or dense card-list hybrid.
- Mobile: stacked cards.

Each item should show:

- Thumbnail.
- Title.
- Platform.
- Upload/publication date.
- Tags.
- Link/open action.
- Edit action.
- Delete action.

Caption should be shown as a short preview, not the main title.

Recommended layout for first production pass:

- Use a dense card-list hybrid rather than a large visual gallery.
- Each row/card should have a thumbnail column, metadata column, and actions column.
- This is better than a pure grid because editors need to scan metadata, dates, tags, and cleanup status.

Desktop structure:

- Left: thumbnail preview in a fixed box, image uses `object-fit: contain`.
- Center: title, caption preview, platform/date chips, source link.
- Right: actions `Open`, `Edit`, `Delete`.

Mobile structure:

- Stacked card.
- Thumbnail full width but contained, not cropped.
- Actions wrap below metadata.

Recommended row content:

- Title as primary text.
- Caption preview as secondary text, max 2 lines.
- Platform chip.
- Content type chip when available.
- Upload date.
- Tags as small chips when available.
- Metadata warning chips where useful, such as `No thumbnail` or `No caption`.

Recommended empty state:

- Use centered empty state inside the bordered list card.
- Copy: `Belum ada konten yang tercatat.`
- Action: `Add Content` and secondary `Import from Channel`.

Recommended error state:

- Use `Alert` at the top of the content area.
- Keep the list container visible if possible.

### Detail/Edit Drawer

Use a right-side drawer for add/edit.

Fields:

- Link.
- Platform.
- Content type.
- Title.
- Caption.
- Internal description/notes.
- Upload/publication date.
- Source post ID.
- Thumbnail URL.
- Tags.

Actions:

- Auto-fill from link.
- Save.
- Delete if editing existing record.
- Cancel.

Recommended drawer behavior:

- Use a right-side drawer like `/contacts` for add/edit.
- Width: `100%` on mobile, around `480px` to `560px` on desktop.
- Header should state the mode clearly: `Add Content` or `Edit Content`.
- Keep save/cancel actions easy to reach.
- Use a separate confirmation dialog for delete.

Recommended drawer sections:

- Source: link, platform, content type.
- Metadata: title, caption, upload date, source post ID.
- Preview: thumbnail URL and contained image preview.
- Organization: tags and internal description.

Form behavior rules:

- Required fields: title, platform, upload date, link.
- Caption is optional but strongly encouraged for social posts.
- Thumbnail URL is optional but should show a missing-thumbnail warning in the list.
- Auto-fill should not overwrite non-empty user-edited fields silently.

Recommended microcopy:

- Link helper: `Paste a published content URL to auto-fill available metadata.`
- Caption helper: `Original caption or post text from the source platform.`
- Description helper: `Internal notes for the team. Not copied from the platform.`

### Metadata Auto-Fill Behavior

When user pastes a link:

- Detect platform.
- Fill title, caption, upload date, source post ID, thumbnail URL where possible.
- Do not overwrite user-edited fields without confirmation.
- Show success/warning status if metadata is partial.

Recommended first behavior:

- If the form field is empty, fill it.
- If the field already has a value, keep user value.
- Show a small message that metadata was imported and can be edited.

Recommended UI feedback:

- During scrape: show inline loading state on the `Auto-fill` button.
- Success: `Metadata imported. Please review before saving.`
- Partial success: `Some metadata could not be found. Complete the missing fields manually.`
- Failure: show the scraper error and keep existing form values.

Recommended field mapping:

- YouTube `title` -> title.
- YouTube description, if later available -> caption.
- Instagram caption -> caption.
- Instagram short generated text -> title if title is empty.
- X tweet text -> caption.
- X short generated text -> title if title is empty.
- OG/page title -> title.
- OG description/meta description -> caption.

## Concrete Page Blueprint

This is the recommended production interface for `/content-record`.

### 1. Shell Header

Use `AdminFeatureShell`.

Content:

- Badge: `Content Library`
- Title: `Content Library`
- Description: one sentence explaining the unified content archive.
- Actions: `Import from Channel`, `Add Content`.

### 2. Metric Summary Card

Below the shell header, show one compact white card with metrics:

- Total records.
- Platforms.
- This month.
- Missing thumbnail or missing tags.

This should match the compact metric area in `/contacts`, `/group`, and `/ticket`.

### 3. Filter Toolbar Card

Below metrics, show a bordered white toolbar:

- Search input.
- Platform select.
- Content type select after schema exists.
- Tag filter after schema exists.
- Clear filters button when filters are active.

Keep it compact and scannable. Avoid large decorative filter panels.

### 4. Content List Card

Below filters, show the content library list.

Preferred first implementation:

- Row-based card list.
- Not a gallery grid.
- Not a plain dense table with tiny thumbnails.

Reason:

- Content metadata needs more room than contact rows.
- Thumbnails need to be visible but not dominant.
- Captions need a preview without taking over the row.

Row anatomy:

- Thumbnail box: fixed width on desktop, contained image.
- Main text: title, caption preview, link/source ID.
- Metadata: platform chip, content type chip, upload date, tags.
- Actions: open source, edit, delete.

### 5. Add/Edit Drawer

Open from `Add Content` or row `Edit`.

Sections:

- Source details.
- Metadata.
- Thumbnail preview.
- Organization.

Use one drawer for both add and edit to keep behavior consistent.

### 6. Delete Confirmation Dialog

Use a small confirmation dialog.

Copy should name the content title.

Example:

- Title: `Delete content record?`
- Body: `This will remove "{title}" from the content library. The original platform post will not be affected.`
- Actions: `Cancel`, `Delete`.

## Visual Rules For Implementation

Use these rules when coding the page:

- Use `adminPalette.canvas` for page background.
- Use `adminPalette.surface` for cards/drawers.
- Use `adminPalette.border` and `adminPalette.borderStrong` for borders.
- Use `adminPalette.brand` for primary actions.
- Use `adminPalette.brandSoft` for active/soft states.
- Use `adminPalette.dangerText` and `adminPalette.dangerBg` only for delete/error states.
- Keep border radius aligned with mature pages: usually `2` to `2.5` in MUI sx values.
- Avoid heavy shadows; prefer bordered white cards.
- Keep all labels concise.
- Make actions explicit; avoid icon-only destructive actions.

## Responsive Rules

- Header actions stack on mobile.
- Metrics stack from row to column on small screens.
- Filter controls wrap before they become cramped.
- Content rows become stacked cards on mobile.
- Drawer becomes full width on mobile.
- Thumbnail remains contained and should never be cropped.

## State Rules

Every major UI block needs states:

- Loading: skeleton-like placeholders or disabled controls.
- Empty: explain no content exists and offer `Add Content`.
- Error: visible `Alert` with recovery message.
- Success: concise toast/alert after save/delete/import.

## Navigation Rules

- Main navigation should label this module as `Content` or `Library`, not `Record`.
- `/scrape` should not be treated as an equal main module once Content Library is production-ready.
- `/scrape` should be reachable from the `Import from Channel` button.
- If `/scrape` remains in sidebar temporarily, label it as `Import` or `Discovery`, not `Scrape`.

## Implementation Plan

### Phase 1: Rename And Layout Polish

Goal:

- Make `/content-record` feel like a production page without changing schema yet.

Tasks:

- Rename visible page title from `Content Recording` to `Content Library`.
- Update page description.
- Add `Add Content` primary CTA.
- Add `Import from Channel` secondary CTA linking to `/scrape`.
- Move form into a drawer/modal instead of always occupying the page.
- Improve list/card layout.
- Show thumbnail using original aspect ratio.

Acceptance criteria:

- Page no longer feels like a PoC form.
- User can still add/delete content as before.
- Existing functionality is preserved.

### Phase 2: Add Caption And Better Metadata

Goal:

- Separate original caption/text from editor-facing title.

Tasks:

- Add `caption`, `description`, and `content_type` columns.
- Update `ContentRecording` type.
- Update `ContentRecordingInput` type.
- Update `toContentRecording` mapper.
- Update `upsertContentRecording` payload.
- Update form state and validation.
- Update scrape auto-fill to populate `caption` where available.
- Keep `title` editable and concise.

Acceptance criteria:

- Instagram/X long text is stored in `caption`, not only `title`.
- User can edit title and caption separately.
- Existing records without caption still render safely.

### Phase 3: Add Tags

Goal:

- Allow editors to add personal/internal tags to content records.

Tasks:

- Add `content_tags` table.
- Add `content_recording_tags` join table.
- Add API/server functions to list/create tags.
- Add API/server function to attach tags to a content record.
- Load tags with content records.
- Add tag selector/chip input to the drawer.
- Add tag filter to the main list.

Acceptance criteria:

- One content record can have multiple tags.
- One tag can be reused across multiple records.
- User can filter records by tag.

### Phase 4: Production Search And Filters

Goal:

- Make content easy to find at scale.

Tasks:

- Add platform filter.
- Add date range filter.
- Add content type filter.
- Consider server-side search/pagination if records grow large.
- Keep current local filtering only if dataset remains small.

Acceptance criteria:

- User can quickly find records by keyword, platform, date, and tag.
- Filtering does not become slow for realistic demo data.

### Phase 5: Edit/Delete Safety

Goal:

- Make editing and deletion production-safe.

Tasks:

- Add explicit edit flow from each item.
- Add delete confirmation dialog.
- Show success/error toast after save/delete.
- Prevent accidental overwrite when auto-fill returns partial metadata.

Acceptance criteria:

- User clearly knows whether they are creating or editing.
- Delete requires confirmation.
- Save errors are visible and recoverable.

## Recommended First Sprint Scope

Do first:

- Rename UI to `Content Library`.
- Improve layout and page hierarchy.
- Add drawer-based add/edit flow.
- Preserve thumbnail ratio.
- Add `caption`, `description`, and `content_type` schema fields.
- Update form and types for the new fields.

Do second:

- Add tag schema and tag UI.
- Add tag filtering.

Do later:

- Server-side pagination.
- Content analytics.
- Draft/pre-content resource management.
- Full category/campaign planning.

## Out Of Scope For This Plan

These should be handled in separate documents/tasks:

- Reworking `/scrape` UI.
- Scheduled WhatsApp blast.
- Pre-content asset/resource management.
- Multi-channel performance analytics.
- Full draft planning workflow.

## Open Decisions

1. Should user-facing route remain `/content-record` or eventually become `/content`?
2. Should `category` be separate from tags, or are tags enough for the assignment scope?
3. Should content type be free text or controlled values?
4. Should imported captions be immutable original text, or editable like all other fields?
5. Should `/scrape` redirect back to `/content-record` after successful import?

## Recommended Decisions

1. Keep `/content-record` route for now, rename only the UI.
2. Use tags first; avoid separate category until product owner asks for strict category taxonomy.
3. Use controlled `content_type` options in the UI, stored as text for flexibility.
4. Make caption editable, because scraped metadata can be wrong or messy.
5. Keep `/scrape` separate but make it a secondary import action from Content Library.
