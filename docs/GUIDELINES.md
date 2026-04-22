# Admin Dashboard Design Guidelines

## Purpose

This document defines a portable design system for admin products and dashboard-heavy back-office applications.

It was originally distilled from a working Vue admin dashboard, but it is intentionally written so it can be applied to other codebases, frameworks, design systems, and brands.

When an existing product conflicts with this document, use this guide as the target standard for new work and refactors unless the host product already has a stronger established system.

## Product Character

The product should feel:

- Institutional and trustworthy
- Clear and operational, not decorative
- Efficient for administrative work
- Calm, modern, and data-first
- Professional enough for institutional, nonprofit, education, finance, or operations stakeholders

This is an admin product, so clarity beats novelty.

## Core Principles

- Prioritize comprehension over visual density.
- Surface the most important decision first.
- Use color to communicate meaning, not decoration.
- Prefer one strong visual hierarchy over many competing accents.
- Make dashboards scannable in under 10 seconds.
- Keep interactions lightweight, predictable, and reversible.
- Standardize on a calm, high-trust visual language that can be remapped to the destination brand.

## Canonical Visual Direction

Use a clean blue-and-slate admin style as the default house style.

This means:

- White or very light slate surfaces
- Deep brand blue as the primary accent
- Slate-based text and borders
- Rounded corners with soft elevation
- Minimal, controlled motion
- Clear table and form states

Avoid drifting into generic template styling or mixing multiple visual languages on the same product.

## Color System

### Primary System Colors

| Role | Recommended color | Usage |
|---|---|---|
| Primary brand | `#003793` / `#003792` | Sidebar, key actions, chart primary series, active states |
| Primary dark | `blue-900` / `blue-800` | Page titles, table headers, modal actions |
| Primary soft | `blue-50` / `blue-100` | Focus surfaces, hover rows, timeline rings, info backgrounds |

These values are reference defaults. In another codebase, map them to the destination brand while preserving the same role structure:

- One dominant primary brand color
- One darker variant for emphasis
- One soft tinted variant for low-emphasis surfaces

### Neutral Colors

| Role | Recommended color | Usage |
|---|---|---|
| App canvas | `slate-50` | Main page background |
| Card surface | `white` | Cards, tables, modals |
| Soft surface | `slate-50` / `gray-100` | Secondary panels, grouped information |
| Border | `slate-200` / `slate-100` | Dividers, inputs, table boundaries |
| Primary text | `slate-900` / `slate-800` | Titles, key values |
| Secondary text | `slate-500` / `slate-600` | Descriptions, metadata |
| Muted text | `slate-400` | Empty states, helper text |

### Semantic Colors

| Meaning | Recommended color | Usage |
|---|---|---|
| Success | `green-600` with `green-100` background | Success badges, positive trend |
| Warning | `amber-600` with `amber-50` background | Access warnings, caution states |
| Error | `red-600` with `red-50` background | Destructive actions, failures |
| Export or secondary positive action | `emerald-600` | Export actions only when appropriate |

### Color Rules

- The primary brand hue is the primary operational color.
- Green means success or positive change, never a primary brand substitute.
- Red is only for destructive or failed states.
- Do not use many saturated colors in the same dashboard.
- In charts, use one dominant brand series first, then semantic support colors only when needed.

## Typography

The recommended typeface is `Inter` or a similarly neutral sans-serif. If the destination product already has an approved type family, keep the hierarchy and density rules even if the font changes.

### Type Hierarchy

| Role | Recommended style |
|---|---|
| Page title | `text-3xl font-bold tracking-tight` |
| Section title | `text-2xl font-bold` |
| Card title | `text-sm` to `text-base font-semibold` |
| KPI value | `text-2xl font-bold` |
| Body text | `text-sm` |
| Secondary text | `text-xs` to `text-sm` |
| Meta label | `text-[11px] font-bold uppercase tracking-widest` |

### Typography Rules

- Use sentence case for most labels and headings.
- Reserve uppercase for compact metadata labels only.
- Keep dashboard text short and scannable.
- Prefer numeric emphasis through weight and spacing, not oversized typography everywhere.

## Layout System

### Global Layout

- Sidebar is the primary persistent navigation for multi-module admin products.
- Main content area uses a light canvas background, usually `bg-slate-50`.
- Standard page padding is `p-6` on mobile and `p-8` on medium and above.
- Page content should read as stacked sections with clear vertical spacing.

### Spacing

Use a restrained spacing scale:

- `gap-2` to `gap-3` for tight control groups
- `gap-4` for standard component spacing
- `gap-6` for section spacing inside a page
- `mt-8` for major dashboard blocks

## Shape, Border, and Elevation

### Border Radius

- Inputs and buttons: `rounded-lg`
- Pills and badges: `rounded-full`

### Borders and Shadows

- Prefer `border border-slate-200` for default card definition.
- Use `shadow-sm` for standard cards.
- Use stronger elevation such as `shadow-2xl` only for modals, popups, or key overlays.
- Do not stack heavy borders and heavy shadows together unless the component is intentionally elevated.

## Navigation

### Sidebar

- Use the primary brand color as the sidebar base, or a darker brand-adjacent tone if contrast requires it.
- Active state must be obvious through background tint, border accent, and full-opacity text.
- Group links under clear section labels when there are many modules.
- Keep icon style consistent across the sidebar.

### Breadcrumbs and Headers

- Use breadcrumbs only when the navigation depth is meaningful.
- Every page should still have a strong local title and short supporting description.

## Component Standards

### Buttons

Use three standard button roles:

- Primary: blue background, white text, used for save, submit, detail, confirm
- Secondary: white background with slate border and slate text
- Destructive: red background for irreversible actions

Button rules:

- Use `font-semibold`.
- Prefer `rounded-lg` or `rounded-xl`.
- Provide hover feedback through slight darkening or opacity change.
- Disabled buttons must reduce opacity and remove pointer affordance.

### Inputs and Filters

Inputs should follow a restrained admin style focused on legibility and repeatability.

Recommended pattern:

- White background
- `border-slate-200`
- `rounded-lg`
- `text-sm text-slate-700`
- `focus:ring-2 focus:ring-blue-500/30`
- `focus:border-blue-400`

Form rules:

- Labels must be short and explicit.
- Placeholder text should support input intent, not duplicate the label unnecessarily.
- Search fields should include a leading search icon when used in toolbar contexts.
- Selects should show a consistent custom chevron affordance.
- Destructive or high-risk changes should require confirmation.

### Tables

Tables are a primary pattern in this product and must be highly legible.

Table standard:

- Wrap large tables in a bordered white card
- Use a strong header row, preferably blue for key operational tables
- Keep body rows white with subtle hover tint such as `hover:bg-blue-50/40`
- Use `text-sm` for cells and `text-xs uppercase tracking-wider` for headers
- Keep actions in a dedicated rightmost column
- Use badges for status instead of plain text when possible

Table behavior rules:

- Show loading skeleton rows when data is loading.
- Show a centered empty state when no records exist.
- Keep search, row limit, and export actions above the table.
- Pagination belongs below the table inside the same container.

### Status Badges

Status must be encoded consistently:

- Pending or waiting: slate
- Approved or success: green
- Rejected or failed: red

Badge rules:

- Use pill shape
- Keep text short
- Use background + text color pairing, not text color alone

### Modals and Dialogs

Use a consistent modal pattern across the product.

Modal rules:

- Use centered overlay with dark translucent backdrop and light blur
- Modal corners should be `rounded-2xl`
- Keep header sticky when body content scrolls
- Use strong title, short explanation, then content
- Confirm destructive or high-impact actions with a separate dialog
- Prefer modal width around `360px` to `540px` depending on task complexity

### Motion

Motion should be short, subtle, and supportive.

Use:

- Fade and slight scale for dialogs
- Small translate and shadow changes for selectable cards
- Spinner only for real loading states

Avoid:

- Long easing sequences
- Decorative animation without state change meaning
- Multiple animated regions competing at once

## Content and Microcopy

### Language

- Choose one primary product language per deployment and use it consistently.
- Localize dates, numbers, currency, and domain terminology to the target users.
- Use English only for technical terms that are already established product language or unavoidable.
- Keep naming consistent across modules. Do not alternate between similar domain terms without reason.

### Writing Style

- Use direct, administrative language.
- Prefer action-first labels such as `Simpan Perubahan`, `Detail`, `Export Excel`.
- Keep helper text brief and informative.
- Empty states should explain what is missing and, when useful, what to do next.

## Accessibility and Responsiveness

### Accessibility

- Ensure color contrast stays strong enough on blue surfaces and badge backgrounds.
- Do not rely on color alone for critical meaning.
- Interactive controls must have visible hover and focus states.
- Use clear button text rather than icon-only actions where the action is not obvious.

### Responsiveness

- Pages must remain usable from mobile through desktop.
- Filters should wrap before they become cramped.
- Tables may scroll horizontally, but summary information should remain readable.
- Modal widths must respect `max-width` and viewport padding.
- KPI cards should collapse from 3 columns to 2 columns to 1 column as needed.

## Golden Standard Dashboarding

This guideline assumes dashboard-heavy admin products, so every dashboard should follow a stricter standard than ordinary CRUD pages.

### Dashboard Goals

A dashboard must help the user:

- Understand current status quickly
- Detect anomalies and trends
- Compare periods or categories
- Identify the next action to take
- Drill into supporting records without losing context

### Golden Dashboard Structure

Every major dashboard should be structured like this:

1. Header with title and one-sentence context
2. Global filters such as date range, program, category, or status
3. KPI summary row with 3 to 6 cards
4. Primary trend visualization
5. Supporting breakdowns or segmentation views
6. Latest activity or exception table
7. Clear drill-down path into operational pages

If a block does not support a decision, remove it.

### KPI Card Standard

KPI cards should contain:

- Metric label
- Primary value
- Optional comparison or trend note
- Simple icon only if it improves scan speed

KPI rules:

- Put the most decision-critical metrics first.
- Keep labels short and consistent.
- Show comparison against previous period when available.
- Do not mix counts, currency, and percentages without clear grouping.
- Use the same number formatting pattern across all cards.

### Chart Standard

Charts must answer one question clearly.

Preferred chart usage:

- Line chart for trends over time
- Bar chart for category comparison
- Donut only for simple composition with few categories
- Area chart only when cumulative shape matters

Chart rules:

- Title every chart with the business question or subject.
- Label axes and units clearly.
- Format currency, dates, and locale according to the deployment context.
- Start with a primary brand series.
- Limit dashboard charts to 2 to 4 meaningful colors.
- Minimize chart chrome: no unnecessary shadows, borders, or toolbars.
- If exact values matter, provide supporting labels, tooltip detail, or related table access.

Avoid:

- Pie or donut charts with many slices
- Rainbow palettes
- 3D or decorative charts
- Charts without timeframe or unit context

### Dashboard Table Standard

Every dashboard should include at least one operational table or recent activity block when users are expected to act on the data.

Recommended use cases:

- Latest transactions
- Pending requests
- Failed transactions
- Recently updated cases
- Outliers or records needing review

This table should help users move from monitoring to action.

### Filters and Comparison

Dashboards should support meaningful filtering when the dataset is broad.

Filter rules:

- Put global filters near the top.
- Use the smallest set of filters that materially changes interpretation.
- Include comparison periods where trend judgment matters.
- Show the active filter context in chart titles or nearby labels when needed.

### States

Every dashboard block must define these states:

- Loading: skeleton, spinner, or placeholder structure
- Empty: explain no data available
- Error: explain failure and recovery action
- Success: show data with clear context

Do not leave blank spaces where widgets failed to load.

### Dashboard Density Rules

- Do not place more than 6 KPI cards in one uninterrupted row.
- Do not place more than 2 primary charts at the same visual level.
- Prefer one hero chart and several supporting modules.
- Use whitespace to separate decisions, not only borders.

### Dashboard Do and Do Not

Do:

- Lead with the most important operational signal
- Combine summary and drill-down paths
- Use consistent time windows and units
- Highlight exceptions, not only totals
- Make status changes traceable through detail views or history

Do not:

- Build dashboards that are only decorative summaries
- Repeat the same metric in multiple widgets
- Mix unrelated domains in one page without clear grouping
- Depend on color-heavy charts to carry the full explanation
- Hide core actions behind secondary navigation if the dashboard is meant to drive action

## Portability Guidance

Use this document as a system of roles, not a rigid dependency on one stack.

Port it by mapping the same ideas into the destination codebase:

- Tailwind utilities to design tokens or component props
- Brand blue to the destination primary brand color
- Slate neutrals to the destination neutral scale
- Button, card, modal, table, and badge patterns to the host component library
- Spacing and typography hierarchy to the host layout system

If the destination stack uses CSS variables, tokens, or a design system package, define semantic roles first:

- `color-bg-canvas`
- `color-bg-surface`
- `color-border-subtle`
- `color-text-primary`
- `color-text-secondary`
- `color-brand-primary`
- `color-brand-primary-soft`
- `color-success`
- `color-warning`
- `color-danger`

Tailwind-like class examples in this document are illustrative, not mandatory.

## Applying To Another Codebase

When adapting this guideline elsewhere:

- Keep the information hierarchy, even if the styling primitives change.
- Preserve the distinction between brand color, semantic color, and neutral surfaces.
- Preserve the dashboard structure before customizing visual details.
- Start by standardizing cards, tables, forms, badges, and modals first.
- Then standardize dashboard KPIs, chart rules, and drill-down flows.
- Only after that, tune brand expression such as color hue, icon style, and motion details.

## Definition Of Done For New Designs

A new screen or dashboard is ready only if:

- It follows the chosen house style consistently
- Hierarchy is understandable in one quick scan
- Primary actions are obvious
- Loading, empty, and error states exist
- Responsive behavior is acceptable on smaller screens
- Data formatting is consistent with the target locale and domain
- The page helps a user decide or act, not just look at data
