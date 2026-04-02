# External Messaging API

This document describes the public WhatsApp notification API for external systems.

## Summary

- Endpoint: `POST /api/v1/messages/whatsapp`
- Purpose: queue standalone outbound WhatsApp notifications
- Delivery model: asynchronous
- Scope: text-only notifications in v1

Important:
- `202 Accepted` means the message was queued, not delivered.
- This API does not create tickets or replies.
- There is no public delivery-status endpoint in v1.
- Idempotency replay is retained in Redis for 24 hours.

## Provision An API Client

1. Generate a new client secret locally:

```bash
npm run provision:api-client -- "Payments Service"
```

2. The script prints JSON containing:
   - `raw_api_key`: give this to the external developer once
   - `insert_sql`: execute this in Supabase
3. Run the generated `insert_sql` statement against `public.api_clients`.
4. Store the `raw_api_key` securely in the calling service.

The provisioning script is [provision-api-client.js](/home/fariz/TUGAS_ITB/PPL/IF3250_K02_G10_IOM4/scripts/provision-api-client.js).

## Request Contract

- Method: `POST`
- Path: `/api/v1/messages/whatsapp`
- Headers:
  - `Authorization: Bearer <api_key>`
  - `Idempotency-Key: <caller-generated key>`
  - `Content-Type: application/json`
- Body:

```json
{
  "to": "+6281234567890",
  "message": "Transfer successful. Thank you for using our service.",
  "client_reference": "trx-123"
}
```

## Field Rules

### Header: `Idempotency-Key`

- Required
- Non-empty after trimming
- Maximum length: 255 characters

### Body: `to`

- Required
- Must contain a valid international phone number
- The API normalizes it to digits only before queueing
- Allowed length after normalization: 8 to 15 digits

### Body: `message`

- Required
- Non-empty after trimming
- Maximum length: 4096 characters

### Body: `client_reference`

- Optional
- If present, it must be non-empty after trimming
- Maximum length: 255 characters

## Example Request

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

## Success Response

```json
{
  "message_id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "status": "queued",
  "accepted_at": "2026-03-31T05:30:00.000Z",
  "client_reference": "trx-123",
  "idempotent_replay": false
}
```

## Error Semantics

- `401`: missing or invalid API key
- `403`: disabled API client
- `409`: idempotency key reused with a different payload
- `429`: client exceeded per-minute or pending-queue limits
- `415`: request is not `application/json`
- `422`: malformed JSON, invalid headers, or invalid body fields

## How To Use `Idempotency-Key`

`Idempotency-Key` exists so the caller can safely retry the same request without creating duplicate outbound messages during the 24-hour Redis retention window.

### What Problem It Solves

Example:

1. The external app sends a WhatsApp notification request.
2. The network times out before it receives the API response.
3. The external app does not know whether the message was already queued.
4. It retries the request.

If the retry uses the same `Idempotency-Key`, the API treats it as the same logical request.

Result:
- same payload + same `Idempotency-Key` => replay the original queued result
- different payload + same `Idempotency-Key` => reject with `409`
- same payload after the 24-hour retention expires => treated as a new request

### Recommended Usage

- Generate one `Idempotency-Key` per logical outbound message request.
- Reuse that same key only when retrying the exact same request.
- Do not generate a new key for transport-level retries.
- Do generate a new key for a new message, even if it is for the same user or the same business entity.
- Do not expect the platform to remember that key forever; the replay window is 24 hours.

### Good Examples

- `order-123-payment-success`
- `payout-784321-send-whatsapp`
- `evt_01HQX6M8R4A6ZP7K3N2Q5S9T`

### Bad Examples

- one fixed key reused for every request
- a new random key on every retry attempt
- reusing one key while changing the recipient, message, or `client_reference`

## How To Use `client_reference`

`client_reference` is caller-owned business context.

It is meant to help the external system answer:
- what business object or event is this message about?

Typical examples:
- transaction ID
- payout ID
- order ID
- invoice ID
- shipment ID

### What The System Does With It

The API currently:
- validates it
- stores it in `outbound_messages.client_reference`
- returns it in the `202` response
- includes it in the request fingerprint used for idempotency comparison

The API does not currently:
- route messages based on it
- prioritize messages based on it
- correlate inbound WhatsApp replies to it
- expose a public lookup endpoint by `client_reference`

So the meaning of `client_reference` is defined by the external caller, not by internal workflow logic.

### Recommended Usage

- Use `client_reference` for your own business identifier.
- Keep it stable across retries of the same request.
- It may stay the same across multiple different notifications if they all refer to the same business object.

Example:

- First message:
  - `Idempotency-Key: order-123-payment-success`
  - `client_reference: order-123`
- Second message:
  - `Idempotency-Key: order-123-shipped`
  - `client_reference: order-123`

Same business object, different logical notifications.

## Relationship Between `Idempotency-Key` And `client_reference`

They solve different problems:

- `Idempotency-Key`: prevents duplicate queue inserts when the caller retries
- `client_reference`: lets the caller attach business context

Simple mental model:
- `Idempotency-Key` = "do not do this twice if I resend the same request"
- `client_reference` = "this request is about order/payment/invoice X"

Important:
- `client_reference` is part of the request fingerprint
- if the caller retries with the same `Idempotency-Key` but changes `client_reference`, the API treats it as a different payload and returns `409`

## Delivery Semantics

- The API is asynchronous.
- The app writes a delivery ledger row to `outbound_messages` and enqueues a BullMQ job in Redis.
- Ticket dashboard replies share the same outbound queue, but they have higher dispatch priority than API notifications.
- The bot reuses the existing retry schedule for transient send failures.
