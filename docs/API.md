# Public API (v1)

Base: `https://<API_DOMAIN>/api/v1`. JSON only. Types: `packages/shared/src/index.ts`.

Common query parameters: `niche` (default `tn-cm`), `limit` (1–50, default 20), `cursor` (opaque,
from `nextCursor`). Errors: `{ "error": { "code": "...", "message": "...", "details"?: [...] } }`
with HTTP 400 (validation, bad cursor), 401, 403, 404, 409, 429 (rate limit), 5xx.

| Method | Path | Description | Cache |
|---|---|---|---|
| GET | `/feed` | Home sections (Latest + feed categories) | 120 s |
| GET | `/news` | Latest accepted articles; filters `category`, `source` (domain), `from`, `to` (ISO) | 60 s |
| GET | `/news/latest` | Latest articles | 60 s |
| GET | `/news/search?q=` | Full-text search; `sort=relevance\|latest`, `category`, `source`, `from`, `to`; returns `total`, `degraded` | 60 s |
| GET | `/news/suggest?q=` | Headline autocomplete (≤8) | 60 s |
| GET | `/news/by-category/:slug` | Articles in a category | 60 s |
| GET | `/news/by-date?date=YYYY-MM-DD` | Articles published on an IST calendar day | 60 s |
| GET | `/news/:id` | Article detail incl. `alsoReportedBy` | 300 s |
| GET | `/categories` | Enabled categories | 600 s |
| GET | `/sources` | Publishers with accepted articles and counts | 600 s |
| POST | `/auth/register` | `{email, password(≥10)}` → `{token, expiresAt, user}` | – |
| POST | `/auth/login` | `{email, password}` → `{token, expiresAt, user}` | – |
| POST | `/auth/logout` | Bearer token; revokes the session | – |
| GET | `/me` | Current user | – |
| GET | `/me/bookmarks` | Bookmarked articles (cursor) | – |
| PUT | `/me/bookmarks/:articleId` | Add bookmark (204) | – |
| DELETE | `/me/bookmarks/:articleId` | Remove bookmark (204) | – |
| POST | `/me/bookmarks/import` | `{articleIds: string[]}` merge device bookmarks | – |

Outside `/api/v1`: `GET /health` (liveness), `GET /health/ready` (PostgreSQL/Redis/OpenSearch
checks), `GET /metrics` (Prometheus, bearer `METRICS_TOKEN`, blocked at the public proxy).

Rate limits: 120 requests/min per IP (10/min for `/auth/*`).

## Admin (`role = admin`, bearer token)

`GET /admin/articles?status=&q=&beforeId=`, `GET /admin/articles/:id`,
`PATCH /admin/articles/:id {status: accepted|rejected|null, categories: string[]|null}`,
`POST /admin/articles/:id/rescore`, `POST /admin/relevance/rescore`,
`GET|POST /admin/queries`, `PATCH /admin/queries/:id`,
`GET|POST /admin/rules`, `PATCH /admin/rules/:id`,
`GET /admin/sources?status=`, `PATCH /admin/sources/:id {name, status, trustWeight}`,
`GET /admin/ingestion/runs`, `GET /admin/ingestion/summary`, `POST /admin/ingestion/run`,
`GET|POST /admin/backfills`, `POST /admin/backfills/:id/resume`, `POST /admin/backfills/:id/cancel`,
`GET /admin/indexing/status`, `POST /admin/indexing/reindex`, `POST /admin/indexing/retry-failed`,
`GET /admin/queues`, `POST /admin/queues/:name/retry-failed`,
`GET /admin/dead-letters`, `POST /admin/dead-letters/:id/retry`, `GET /admin/audit-log`.
