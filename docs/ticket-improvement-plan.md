# Ticket Improvement Plan

## Goal

Improve the `/ticket` workflow so admins can review and act on tickets without losing queue context, filters, sorting, pagination, or search state.

## Recommended UX

Use a ticket list plus detail panel pattern.

- Desktop: open ticket detail in a right-side drawer or split-view panel.
- Mobile/tablet: open ticket detail as a full-screen sheet.
- Keep `/ticket/[id]` as a direct-access fallback page for refresh, sharing, and browser history.
- Avoid a floating chat bubble for admin ticket management because that pattern is better suited for end-user support widgets, not queue triage.

## Why This Is Better

- Keeps admins in the ticket queue while reading or replying to a ticket.
- Preserves current list state: page, search, sort, and instance filter.
- Supports faster triage: open ticket, reply or close, then move to the next ticket.
- Matches common helpdesk/admin workflows more closely than navigating away for every ticket.
- Allows deep linking and refresh-safe behavior if the selected ticket is reflected in the URL.

## Proposed URL Behavior

- Normal list: `/ticket?page=1&sort=updated_at&sortDir=desc`
- Selected ticket in panel: `/ticket?page=1&sort=updated_at&sortDir=desc&ticketId=<id>`
- Direct detail fallback remains available at `/ticket/<id>`.

Closing the panel should remove `ticketId` while keeping other query params intact.

## Implementation Steps

1. Extract reusable ticket detail UI from `/ticket/[id]`.
2. Update `TicketTable` row actions to set `ticketId` in the current query string instead of navigating away on desktop/tablet flows.
3. Add a server-rendered or client-loaded detail drawer to `/ticket` that reads `ticketId` from search params.
4. Keep `/ticket/[id]` using the same reusable detail UI for direct links.
5. Make the drawer responsive: side panel on desktop, full-screen sheet on smaller screens.
6. Preserve close/back behavior by removing only `ticketId` from the URL.
7. Verify reply, close-ticket, and status refresh flows still work from both the panel and direct page.

## Production Considerations

- Accessibility: focus trap in drawer, Escape closes panel, meaningful labels for close/back controls.
- History: browser Back should close the selected ticket before leaving the list page.
- Loading state: show a compact skeleton while fetching ticket detail.
- Error state: show a recoverable message if the selected ticket is missing or inaccessible.
- Data freshness: after replying or closing a ticket, refresh the list and detail data.
- Mobile: panel should be full-screen to avoid cramped chat UI.

## Success Criteria

- Admin can open a ticket from `/ticket` without losing table state.
- Closing the detail panel returns to the exact same list view.
- Direct links to `/ticket/[id]` still work.
- Reply and close actions work from the new panel.
- Typecheck, lint, and relevant tests pass or only fail on known unrelated issues.
