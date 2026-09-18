# cmnewstamilnadu

chief minister news of tamilnadu.

An open source news aggregation app focused on Tamil Nadu Chief Minister **C. Joseph Vijay** and
his government. English coverage is discovered through the public [GDELT Project](https://www.gdeltproject.org/),
filtered with transparent, deterministic rules (no AI), de-duplicated, categorised and served to
a black-and-white React Native app.

```
GDELT → ingestion → normalisation → relevance → dedup → quality → PostgreSQL ─┬─► OpenSearch ─► API ─► app
                                                                               └─► BullMQ/Redis
```

- `apps/backend`: NestJS + Fastify API and background worker (TypeScript)
- `apps/mobile`: React Native (Expo) app, strictly black and white
- `packages/shared`: API types shared by both
- `infrastructure`: Docker Compose (production + dev), lean OpenSearch image, Caddy, backup scripts
- `docs`: [architecture](docs/ARCHITECTURE.md), [operations](docs/OPERATIONS.md), [API](docs/API.md)

## Quick start (development)

Requirements: Node 22+, Docker.

```bash
npm install
docker compose -f infrastructure/docker-compose.dev.yml up -d   # PostgreSQL, Redis, OpenSearch
cp apps/backend/.env.example apps/backend/.env.development
npm run build && npm test

cd apps/backend && set -a && . ./.env.development && set +a
node dist/main.js      # API  → http://localhost:3000/api/v1/feed
node dist/worker.js    # worker: ingestion every 30 min + initial backfill (4 May → 18 Sep 2026)

cd ../mobile && npm install
npx expo start   # Expo Go uses this computer's LAN IP on port 3000 for the API
```

## Production

One 2 vCPU / 4 GB VPS with Docker Compose — see [docs/OPERATIONS.md](docs/OPERATIONS.md).

```bash
cd infrastructure && cp .env.production.example .env   # fill in domain and secrets
docker compose up -d --build
```

## Principles

- GDELT is the only news source, and only the server talks to it.
- PostgreSQL is the source of truth; OpenSearch is a derived index that can always be rebuilt.
- Only headlines, publishers, dates and links are stored. Full stories stay with their publishers.
- No AI, no machine translation, no commercial news APIs.

## License

Apache-2.0 — see [LICENSE](LICENSE). News content belongs to its respective publishers.
