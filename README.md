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

This project now exposes `POST /api/v1/messages/whatsapp` for external systems that need to queue standalone outbound WhatsApp notifications.

### Provision an API Client

1. Generate a new client secret locally:

```bash
npm run provision:api-client -- "Payments Service"
```

2. The script prints JSON with:
   - `raw_api_key`: hand this to the external developer once
   - `insert_sql`: insert this into the `api_clients` table
3. Execute the generated `insert_sql` statement in Supabase.
4. Store the raw API key securely in the calling service.

### Request Contract

- Method: `POST`
- Path: `/api/v1/messages/whatsapp`
- Headers:
  - `Authorization: Bearer <api_key>`
  - `Idempotency-Key: <unique request key>`
  - `Content-Type: application/json`
- Body:

```json
{
  "to": "+6281234567890",
  "message": "Transfer successful. Thank you for using our service.",
  "client_reference": "trx-123"
}
```

### Example Request

```bash
curl -X POST http://localhost:3000/api/v1/messages/whatsapp \
  -H "Authorization: Bearer wapi_exampleprefix_example-secret" \
  -H "Idempotency-Key: transfer-trx-123" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+6281234567890",
    "message": "Transfer successful. Thank you for using our service.",
    "client_reference": "trx-123"
  }'
```

### Success Response

```json
{
  "message_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "status": "queued",
  "accepted_at": "2026-03-31T05:30:00.000Z",
  "client_reference": "trx-123",
  "idempotent_replay": false
}
```

### Error Semantics

- `401`: missing or invalid API key
- `403`: disabled API client
- `409`: idempotency key reused with a different payload
- `429`: client exceeded per-minute or pending-queue limits
- `415`: request is not `application/json`
- `422`: malformed JSON, invalid headers, or invalid body fields

### Delivery Semantics

- The API is asynchronous. A `202 Accepted` response only means the message has been queued.
- The WhatsApp bot worker sends queued rows from `outbound_messages` and reuses the existing retry schedule for transient failures.
- Ticket dashboard replies are also queued into `outbound_messages`, with higher dispatch priority than API notifications.
- Messages sent through this API do not create tickets or replies.
- There is no public delivery-status endpoint in v1.

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
