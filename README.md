# IF3250 K02 G10 - Ticketing App

This repository contains:

- A Next.js web app.
- A WhatsApp bot worker (`scripts/whatsapp-bot.js`) that creates/updates tickets through Supabase.

## Local Development

1. Copy `.env.example` to `.env.local` and fill in all values.
2. Install dependencies:

```bash
npm ci
```

3. Run web + bot together:

```bash
npm run dev
```

The web app runs on `http://localhost:3000`.

Run the automated checks:

```bash
npm run lint
npm run test
```

## Architecture Context

For the current message-flow design, queue model, and recommended next-step roadmap, see `docs/ARCHITECTURE.md`.

## DB Schema

For the current human-readable database schema reference, see `docs/DB_SCHEMA.md`.

## Database Setup

Apply the SQL migration in `supabase/migrations/20260331120000_public_whatsapp_notification_api.sql` before using the public messaging API. If you are managing Supabase manually, paste that file into the Supabase SQL Editor and run it once.

## External Messaging API

This project exposes `POST /api/v1/messages/whatsapp` for external systems that need to queue standalone outbound WhatsApp notifications.

For the full external API contract, provisioning flow, and guidance on `Idempotency-Key` and `client_reference`, see [EXTERNAL_MESSAGING_API.md](/home/fariz/TUGAS_ITB/PPL/IF3250_K02_G10_IOM4/docs/EXTERNAL_MESSAGING_API.md).

## Internal Dispatch Control API

This project also exposes an internal control surface for outbound flow rate:

- `GET /api/admin/outbound-dispatch-settings`
- `PATCH /api/admin/outbound-dispatch-settings`

Current behavior:

- controls the global outbound messages-per-minute pacing
- can pause `api_notification` sends without pausing ticket replies
- returns live queue counts for ticket replies and API notifications

Warning:

- this control API currently uses the same open-dashboard trust model as the rest of the app
- it is intentionally temporary and should not be treated as secure outside a trusted internal environment

## Docker

The project includes:

- `Dockerfile` for the Next.js web app.
- `Dockerfile.bot` for the WhatsApp bot worker (with Chromium installed).
- `docker-compose.yml` to run both services.

### Prerequisites

- Docker Engine (or Docker Desktop) with Compose support.

### Run with Docker Compose

1. Ensure `.env.local` exists in the repository root.
2. Build and start all services:

```bash
docker compose up --build
```

3. Open the web app at `http://localhost:3000`.
4. For WhatsApp QR login, view bot logs:

```bash
docker compose logs -f bot
```

### Useful Commands

Start only web app:

```bash
docker compose up --build web
```

Stop and remove containers:

```bash
docker compose down
```

Also remove the persisted WhatsApp auth volume:

```bash
docker compose down -v
```
