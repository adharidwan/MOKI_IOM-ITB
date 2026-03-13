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
