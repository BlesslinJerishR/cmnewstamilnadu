# CM News Tamil Nadu — Architecture

This document describes the system as implemented in this repository. File references point at
the code that realises each decision.

## 1. Executive architecture summary

A focused news aggregation app for coverage of Tamil Nadu Chief Minister C. Joseph Vijay.

- **GDELT is the only news source.** A background worker discovers coverage via the GDELT DOC 2.0
  API (recent windows) and GDELT GKG 2.1 archive files (historical backfill). The mobile app never
  talks to GDELT.
- **Deterministic pipeline, no AI.** Normalisation → canonical-URL dedup → rule-based relevance
  scoring → title/near-duplicate dedup → quality filter → rule-based categories.
- **PostgreSQL is the source of truth.** OpenSearch is a derived, rebuildable search index fed by a
  transactional outbox. Redis holds queues (BullMQ), response cache and rate-limit counters only.
- **Modular monolith** (NestJS + Fastify, TypeScript): one codebase, two processes (`api`, `worker`).
- **One 2 vCPU / 4 GB VPS**, Docker Compose, Caddy for TLS. Every data store is private.
- **React Native (Expo) app**, white-first monochrome editorial design (black and white only, photos in grayscale), offline-capable.
- **Initial load:** 4 May 2026 → 18 Sep 2026 via a resumable backfill created on first start.

## 2. Final technology stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | NestJS 11, Fastify 5, TypeScript 5.9 | `apps/backend` |
| Database | PostgreSQL 17 (`pg_trgm`) | system of record |
| Search | OpenSearch 2.19 single node, all plugins removed | `infrastructure/opensearch/Dockerfile` |
| Queue | BullMQ 5 on Redis 8 | `noeviction`, AOF |
| Mobile | React Native 0.86 via Expo SDK 57 | `apps/mobile` |
| Proxy/TLS | Caddy 2 | automatic HTTPS |
| Provider | GDELT DOC 2.0 API + GKG 2.1 files | no commercial news APIs |

No LLMs, embeddings, vector search, translation models or AI services are used anywhere. The
OpenSearch image even removes the ML/neural/k-NN plugins.

## 3. High level architecture diagram

```
                 GDELT (DOC API + GKG archive files)
                              |
                              v
             Worker: ingestion jobs (BullMQ, Redis)
                              |
                              v
       Normalisation -> Canonical URL dedup -> Relevance
          -> Title / near-duplicate dedup -> Quality -> Categories
                              |
                              v
         PostgreSQL  (articles + search_outbox, one transaction)
              |                               |
              | outbox relay (BullMQ)         | browse / detail / feed / bookmarks
              v                               v
         OpenSearch  ---- search ---->  NestJS + Fastify API  <---- Redis cache / rate limit
                                              |
                                          Caddy (TLS)
                                              |
                                     React Native app
```

## 4. Detailed component architecture

| Component | Location | Responsibility |
|---|---|---|
| Config | `src/config` | zod-validated environment; process fails fast on bad config |
| Database | `src/infrastructure/database` | pg pool, transactions, SQL migrations (advisory-locked) |
| Redis | `src/infrastructure/redis` | fail-fast cache connection + BullMQ connection |
| Queue | `src/infrastructure/queue` | queue names, job names, default retry/retention |
| OpenSearch | `src/infrastructure/opensearch` | index definition, alias management, bulk |
| Cache | `src/infrastructure/cache` | generation-based response cache |
| Niches | `src/modules/niches` | niche config, seed data, compiled rule engines |
| GDELT | `src/modules/gdelt` | DOC client (rate-limited), GKG archive reader, dedicated HTTP agent |
| Ingestion | `src/modules/ingestion` | scheduled cycles, backfills, slices, run history |
| Processing | `src/modules/processing` | normaliser and the article pipeline |
| Relevance | `src/modules/relevance` | deterministic scoring engine |
| Deduplication | `src/modules/deduplication` | title hash + pg_trgm near-duplicate detection |
| Quality | `src/modules/quality` | deterministic quality rules |
| Categories | `src/modules/categories` | rule-based multi-label classifier |
| Indexing | `src/modules/indexing` | outbox relay, full reindex, recovery |
| News / Search / Feed | `src/modules/{news,search,feed}` | public read APIs |
| Users / Bookmarks | `src/modules/{users,bookmarks}` | optional accounts and bookmark sync |
| Admin | `src/modules/admin` | moderation, rules, queries, sources, jobs, backfills |
| Health / Metrics | `src/modules/{health,metrics}` | liveness/readiness, Prometheus metrics |
| Maintenance | `src/modules/maintenance` | retention, disk checks, rescoring |
| Worker runner | `src/worker` | BullMQ workers and schedules |

## 5. GDELT ingestion architecture

- **Scheduled cycle** (`IngestionService.enqueueCycle`): a BullMQ job scheduler fires every
  `INGEST_INTERVAL_MINUTES` (default 30; 15/60 are a config change). Each enabled query becomes one
  `fetch-doc-window` job for the window `[now − window_minutes, now]` (default 180 minutes).
- **Why overlap:** GDELT indexes articles minutes to hours after publication, and a run can fail. A
  window six times longer than the interval means every article is seen by several runs; missing
  one run loses nothing. Duplicates this creates are absorbed by the canonical URL constraint and
  counted as `existing`.
- **Duplicate jobs:** scheduled jobs get deterministic ids (`doc-<query>-<interval bucket>`), so a
  cycle cannot enqueue the same window twice.
- **No overlapping workers:** DOC requests are serialised deployment-wide by a Redis slot
  (`SET NX PX`), ≥10 s apart; after a rate-limit answer the slot is held for 5 minutes.
- **Rate limiting without waste:** when the slot is held longer than normal spacing, the job does
  not wait inside a worker. The worker calls BullMQ's `worker.rateLimit(ms)` and throws
  `RateLimitError`: the whole DOC queue pauses, the job returns to the queue without using an
  attempt, and no failed run is recorded.
- **Retries/backoff:** 5 attempts, exponential from 30 s (backfill DOC slices: 8) for real errors
  (network, 5xx, malformed data). Queries GDELT rejects outright (syntax) fail immediately
  (`UnrecoverableError`).
- **Record cap:** DOC returns ≤250 records; full windows are split in half recursively.
- **History:** every fetch writes an `ingestion_runs` row (window, counts, duration, error).
- **Backfill** (`createBackfill`): the range is cut into slices stored in `backfill_slices`:
  one per 15-minute GKG file for the whole range (complete, not rate limited) plus DOC day-slices
  for the last `GDELT_DOC_MAX_LOOKBACK_DAYS`. Slices are idempotent jobs (id = slice id), resume
  on restart, and failed slices are retried automatically every 30 minutes (up to 40 attempts).
  GKG files run on their own `gdelt-archive` queue so they never wait behind rate-limited calls.
- **Initial load:** `INITIAL_BACKFILL_FROM=2026-05-04`, `INITIAL_BACKFILL_TO=2026-09-18` make the
  worker create that backfill once (recorded in `system_settings`). Dates are IST calendar days.

## 6. GDELT query strategy

Queries live in `gdelt_queries` (seeded from `src/modules/niches/seed-data.ts`), editable through
the admin API, never in the app. Each has text, language filter, priority, enabled flag, window,
max results and a **relevance weight** (the evidence that the article's full text matched):

| name | query | weight |
|---|---|---|
| joseph-vijay | `"Joseph Vijay"` | 35 |
| chief-minister-vijay | `"Chief Minister Vijay"` | 35 |
| cm-vijay-tamil-nadu | `"CM Vijay" "Tamil Nadu"` | 30 |
| vijay-tamil-nadu-chief-minister | `Vijay "Tamil Nadu" "Chief Minister"` | 25 |
| vijay-tvk | `Vijay "Tamilaga Vettri Kazhagam"` | 20 |

`sourcelang:english` is appended. A bare `"Vijay"` query is never used. GKG backfills use the
niche's anchor pattern (`\bvijay\b`) against title, URL and GDELT-extracted person names.

## 7. Article processing pipeline

`ArticleProcessorService.processBatch` (processing queue, concurrency 1 so dedup never races):

1. **Normalise** (`normalizer.ts`): parse/validate URL (public http(s) only), canonicalise, clean
   title (entity decoding, GDELT token spacing, publisher suffix removal), parse timestamps.
2. **Canonical URL dedup:** `UNIQUE (niche_id, url_hash)`. A re-sighting only records the extra
   matched query; new evidence can re-score and promote a non-public article.
3. **Relevance** → 4. **Title / near-duplicate dedup** → 5. **Quality** → 6. **Categories**.
7. **Store** the article, categories and (if accepted) an outbox row in **one transaction**.

Internal schema ≠ GDELT schema: our model is provider-agnostic (`RawCandidate`), keeps only what
the app needs, carries our own decisions (scores, status, categories) and survives a provider
change. `provider_metadata` keeps a little GDELT context for 30 days only.

## 8. Relevance engine

`src/modules/relevance/relevance.engine.ts`, rules in `relevance_rules`:

- **Rule types:** `phrase` (whole-word), `regex`, `proximity` (term A within N tokens of B).
- **Fields:** title (×1.0), description (×0.7), URL slug (×0.6), GDELT entities (×0.8). Entities
  are matched one entity at a time, so a phrase never spans two names ("Chief Minister ; Vijay
  Sharma" does not read as "Chief Minister Vijay").
- A rule counts once at its strongest field, plus 10 % per extra occurrence (max 3): frequency
  matters but cannot dominate.
- **Positive signals:** full name (45), "CM/Chief Minister Vijay" (45, not "CM Vijay Rupani"),
  "Vijay as TN CM" (35), "TVK chief Vijay" (35), "Tamil Nadu CM" (25), Vijay near government words
  (15), TVK (12), Tamil Nadu (10), bare "Vijay" (12), Chennai/Fort St George (small).
- **Negative signals:** other Vijays (−35: Sethupathi, Antony, Rupani, Mallya, …), Vijay Diwas
  (−80), Vijay TV (−40), film words in title/URL (−12), entertainment/sports URL sections (−15).
- **Provider evidence:** best matched query weight, +5 if several queries matched.
- **Source/geography:** trusted publishers +5, source country India +3.
- **Anchor:** the article must mention "vijay" somewhere, or have matched a DOC query.
- **Thresholds:** ≥50 relevant, 30–49 review, <30 irrelevant (per niche).
- **Explainability:** every contribution is stored in `relevance_signals`.
- **Manual override:** `manual_status` always wins; rescoring respects it.

## 9. Deduplication engine

| Level | Method | Enforcement |
|---|---|---|
| 1–2 | canonical URL (scheme/www/m/amp/tracking params/fragments/trailing slash removed, params sorted) → SHA-256 | `UNIQUE (niche_id, url_hash)` |
| 3 | normalised title SHA-256 | lookup, ±36 h |
| 4 | same source + same title | reason `same_title_same_source` |
| 5 | pg_trgm similarity ≥ 0.75 (titles ≥ 30 chars) within ±36 h | GIN trigram index |

The **primary identifier** is the canonical URL hash. The earliest stored article is the
representative; copies keep `duplicate_of_id` and a reason (`syndicated_same_title`,
`syndicated_near_duplicate`, …). Syndicated wire copies (ANI/IANS/PTI republished by many outlets)
are shown on the detail screen as "Also reported by". If a representative is later rejected, its
copies are re-evaluated. Duplicates are never indexed.

Fuzzy (level 5) matches have two deterministic guards (`fuzzyMatchAllowed`): headlines whose
numbers differ are never merged ("₹500 crore" vs "₹200 crore"), and a headline naming the niche
anchor (the CM) is never hidden behind one that doesn't ("PM Modi congratulates" vs "CM Vijay
congratulates"). Rescoring re-checks existing fuzzy matches with the same guards.

## 10. Article quality system

`assessQuality` → `accepted` / `pending_review` / `rejected`:

- **Reject:** blocked source, non-English language, non-Latin title script, timestamp before
  2000 or >1 h in the future, title <15 chars / <3 words, spam words, homepage URL, invalid URL.
- **Review:** suspicious TLDs, live-blog/tag/gallery/video URLs, all-caps titles, excessive
  punctuation (trusted sources skip review for soft issues).
- Final status: rejected if relevance or quality rejects; duplicate; review if either says review;
  otherwise accepted. Rejected rows are kept 30 days for debugging and never exposed publicly.

## 11. Category architecture

`categories` + `category_rules` (phrase/regex, weight, fields). Title matches count double; an
article joins every category whose score reaches the category minimum (multi-label), falling back
to `general`. Categories: politics, government, policy, welfare, education, healthcare, economy,
infrastructure, law-and-order, elections, tamil-nadu, national, international, statements,
events, general. `is_feed_section` decides home feed sections. Admins can pin categories manually
(`manual_categories`), which rescoring respects.

## 12. PostgreSQL data model

See `apps/backend/migrations/001_initial_schema.sql`. Tables: `niches`, `gdelt_queries`,
`relevance_rules`, `sources`, `categories`, `category_rules`, `articles`, `article_categories`,
`ingestion_runs`, `backfills`, `backfill_slices`, `search_outbox`, `users`, `sessions`,
`bookmarks`, `dead_letter_jobs`, `system_settings`, `admin_audit_log`.
Key indexes: partial `(niche_id, published_at DESC, id DESC) WHERE status='accepted'` for feeds,
partial `(niche_id, source_domain, published_at DESC, id DESC) WHERE status='accepted'` for
publisher pages, trigram GIN on `normalized_title` (dedup and the search fallback),
`(niche_id, title_hash)`. Category feeds filter by `category_id` via a one-row subquery, so they
walk the feed index newest-first instead of sorting the whole category.
**Translation readiness:** a future `article_translations (article_id, language, title,
description, method, created_at)` table keyed by article id; the canonical article stays English.

## 13–14. OpenSearch architecture and index design

- Alias `articles` → versioned index `articles_v<timestamp>`; reindex = build new + atomic swap.
- 1 primary shard, 0 replicas (single node), `refresh_interval` 5 s, `dynamic: strict`.
- Fields: `title`/`description` (`english_text` analyser: possessive stemmer, lowercase,
  ASCII folding, English stop words, English stemmer) with `.exact` sub-fields (no stemming) and
  `title.suggest` (`search_as_you_type`); keyword fields `id`, `niche`, `source_domain`,
  `categories`, `language`, `source_country`; `source_name` text + keyword; `published_at`,
  `first_seen_at` dates; `relevance_score` float; `url`/`image_url` stored but not indexed.
- **Tamil readiness:** add `title_ta`/`description_ta` with a Tamil-capable analyser (ICU
  tokenizer) in a new index version, then reindex from PostgreSQL. No mapping change in place.

## 15. OpenSearch search strategy

`SearchService.buildQuery`: `multi_match` (best_fields) over `title^3`, `title.exact^4`,
`description`, `description.exact^1.5`, `source_name^0.5` with `minimum_should_match 2<75%`;
phrase boosts on `title.exact` (×6) and `description.exact` (×2); filters for niche, category,
source, date range. `function_score` multiplies text relevance by (freshness Gaussian decay,
scale 14 days) + (relevance_score / 100). Sort by score or by date; `search_after` cursors.
Autocomplete: `bool_prefix` over `title.suggest`.

## 16. PostgreSQL ↔ OpenSearch synchronisation

Transactional outbox: any change that can affect the public index inserts a `search_outbox` row
in the same transaction. The relay (every 30 s and on demand) reads the **current** PostgreSQL row
for each id and upserts it (accepted) or deletes it (anything else). A crash after commit cannot
lose an update: the outbox row is durable. OpenSearch outages leave rows pending without burning
retries; only per-document rejections count toward the 10-attempt limit. Replays are idempotent.
Chosen for the MVP because it costs one small table and removes a whole class of drift bugs.

## 17. BullMQ architecture

| Queue | Jobs | Concurrency |
|---|---|---|
| `gdelt-ingestion` | `ingest-cycle`, `fetch-doc-window` | 2 (DOC calls serialised by Redis slot) |
| `gdelt-archive` | `fetch-gkg-file` | `GDELT_GKG_CONCURRENCY` (2) |
| `article-processing` | `process-batch` (≤100 candidates) | 1 |
| `search-indexing` | `outbox-relay`, `reindex-all` | 1 |
| `maintenance` | `retention`, `disk-check`, `rescore-all`, `resume-backfills` | 1 |

Priorities: scheduled 1, manual 2, backfill 10. Retries: exponential backoff from 30 s.
Stalled jobs: 120 s lock, checked every 60 s, max 2 stalls. Retention: completed 24 h/200,
failed 7 days/500. **Dead letters:** jobs that exhaust retries are copied to
`dead_letter_jobs` (PostgreSQL) and can be retried from the admin API. All jobs are idempotent.
No translation queue exists.

## 18. Redis architecture

- One Redis, `maxmemory 192mb`, `noeviction` (BullMQ requirement), AOF every second.
- Cache keys `cache:<generation>:<key>` with TTLs (feed 120 s, lists/search 60 s, detail 300 s,
  categories/sources 600 s), values ≤256 KB. New public content bumps the generation, which
  invalidates everything at once; stale generations expire.
- Rate-limit keys `ratelimit:*` (Fastify rate limit, per IP, 60 s window).
- The cache connection has no offline queue and a 750 ms timeout: Redis down = no cache, not
  errors. Redis never stores articles permanently.

## 19. NestJS backend architecture

Modular monolith (`app.module.ts`): `InfrastructureModule` (global config, DB, Redis, queues,
OpenSearch, cache), `DomainModule` (services), `AppModule` (controllers, API process) and
`WorkerModule` (BullMQ workers). Dependencies flow one way: gdelt → processing → PostgreSQL +
outbox → indexing → OpenSearch; news/search/feed only read. Pure logic (normaliser, relevance,
quality, classifier) has no framework dependencies and is unit tested.

## 20. API architecture

See `docs/API.md`. `/api/v1` prefix; zod validation; cursor pagination (opaque base64url
`(published_at,id)` or OpenSearch `search_after`), limit ≤50; uniform errors
`{ error: { code, message, details? } }`; Redis caching; rate limits 600/min/IP, generous because Indian carriers put many users behind one IP (auth 10/min).

## 21. Feed architecture

`GET /feed` returns server-defined sections: Latest (10) + every `is_feed_section` category (6
each: Politics, Government, Policy, Welfare, Education, Healthcare, Economy). Empty sections are
omitted. Read from PostgreSQL, cached 120 s. The app renders whatever it receives.

## 22. React Native architecture

Expo app (`apps/mobile`): React Navigation (tabs Home, Latest, Topics, Search, Saved; stack
Article, Category, Source, Sources, Settings, About, Privacy, Account), TanStack Query for data,
AsyncStorage persistence, SecureStore for the session token, NetInfo for connectivity.

**Design system** (`src/theme/tokens.ts`): a white-first monochrome editorial UI. Colours are
white, black, and black at controlled opacity for secondary text, hairlines and surfaces; a
4-point spacing scale; radius 0/2/4; one system typeface (SF / Roboto, both Tamil-capable) in a
fixed type scale; Lucide icons only. Publisher photos are shown **in monochrome**: a saturation
blend layer over `expo-image` (memory + disk cache, decoded at view size) removes colour on iOS and
Android. Components (`src/components`): `AppHeader`, `SectionHeader`, `FeaturedArticle`,
`CompactArticle`, `MetadataRow`, `CategorySelector`, `SearchBar`, `Segmented`, `BookmarkButton`,
`Button`, `IconButton`, `NewsImage`, skeletons, `EmptyState`, `ErrorState`, `OfflineNotice`,
`ArticleFeed` (virtualised feed with day grouping) and a custom `BottomTabBar` (selected tab marked
by a black bar, heavier stroke and full-strength label). Touch targets are ≥44 pt, text scales with
the system font size (capped), and every control has an accessibility role and label. Original
articles open in an in-app browser; `cmnews://article/<id>` deep links.

## 23. Mobile caching

TanStack Query cache persisted to AsyncStorage for 7 days (busted on app version change):
feed, lists (≤10 pages each), categories, sources, article details, searches (30 min in memory).
`staleTime` 2 min (articles 10 min, categories 1 h); `networkMode: offlineFirst` shows cached data
immediately and refreshes when online; pull-to-refresh on every list; an inverted "Offline ·
showing saved news" strip when disconnected. Bookmarks store a copy of the article card locally,
so saved articles always work offline. "Clear offline news" in Settings.

## 24. Server caching

See §18. Search results are cached for 60 s only and degraded (fallback) results are not cached.

## 25. VPS resource allocation (2 vCPU / 4 GB / 40 GB)

| Service | Memory limit | Notes |
|---|---|---|
| OpenSearch | 1536 MB | 768 MB locked heap; measured ~1.1 GB RSS |
| PostgreSQL | 700 MB | shared_buffers 192 MB, max_connections 40 |
| Worker | 448 MB | Node heap 320 MB |
| API | 320 MB | Node heap 224 MB |
| Redis | 256 MB | maxmemory 192 MB |
| Caddy | 64 MB | |
| OS + Docker | ~700 MB | plus 2 GB swap recommended |

**Risk assessment:** OpenSearch is the largest consumer and the main risk. It is sustainable here
because the index is small (tens of thousands of short documents, well under 1 GB), plugins are
removed, the heap is capped and locked, and there are no replicas. Consequences: a single node has
no redundancy (an outage degrades search to the PostgreSQL fallback; data is safe in PostgreSQL),
and heavy concurrent search load will be CPU-bound on 2 vCPUs. `vm.max_map_count=262144` and swap
must be configured on the host (see `docs/OPERATIONS.md`).

## 26. Storage architecture

Named volumes for PostgreSQL, OpenSearch, Redis; Docker logs rotated (3×10 MB per service); local
backups keep only 3 dumps (off-site holds the history). Only metadata is stored (no article
bodies, no raw GDELT payloads — GKG lines are streamed and discarded). Estimated growth: ~2 KB per
article row + index → well under 1 GB/year for this niche. Disk usage is checked every 10 min:
80 % warns, 90 % pauses backfills and runs retention immediately.

## 27. Deployment architecture

Docker Compose on the VPS (`infrastructure/docker-compose.yml`): Caddy is the only public
service; `internal` network (no internet) for PostgreSQL, Redis, OpenSearch; the worker alone has
egress to GDELT. Compose is the right tool at this size: one host, restart policies, health checks,
memory limits, no orchestration overhead. Kubernetes is not used.

## 28. Security architecture

HTTPS via Caddy (HSTS), firewall allowing 22/80/443 only, SSH keys only (see OPERATIONS), secrets
in an untracked `.env`, databases on an internal Docker network with passwords, helmet headers,
CORS closed by default, zod validation on every input, body size limits, per-IP rate limits,
scrypt password hashes, hashed opaque session tokens, admin role guard + audit log.
`X-Forwarded-For` is trusted only from loopback/private addresses (`TRUST_PROXY`, i.e. Caddy on
the Docker network), so clients cannot spoof their IP to dodge rate limits. **SSRF:** the
server never fetches article URLs; it only fetches GDELT endpoints. External URLs are validated
(public http(s), no IPs/credentials/odd ports) and only ever returned as links. `/metrics`
requires a token and is blocked at Caddy.

## 29. Backup and disaster recovery

`infrastructure/scripts/backup-postgres.sh`: daily `pg_dump -Fc`, verified with `pg_restore
--list`, copied off-site with rclone (daily 14 d, weekly 60 d, monthly 1 y), only 3 kept locally.
`restore-test.sh` proves a dump restores into a throwaway container (run monthly).
`restore-postgres.sh` restores production and rebuilds the index.

## 30. OpenSearch recovery strategy

OpenSearch is never backed up; it is rebuilt. `reindexAll` streams accepted articles from
PostgreSQL in keyset batches of 500 into a new versioned index, swaps the alias atomically, then
replays outbox rows created meanwhile. The relay triggers this automatically whenever the alias
is missing (tested by deleting the index). Manual: `node dist/cli.js reindex` or
`POST /api/v1/admin/indexing/reindex`. Batching scales to millions of rows.

## 31. Monitoring

`GET /metrics` (Prometheus format): HTTP latency histogram, Node process metrics, articles by
status, ingestion runs/outcomes (duplicate and rejection rates) in 24 h, age of the last successful
scheduled fetch, outbox pending/failed, BullMQ queue depths, Redis memory, PostgreSQL size and
connections, OpenSearch up/heap/disk/doc count, disk usage. `/health` (liveness) and
`/health/ready` (PostgreSQL required; Redis/OpenSearch → `degraded`). Suggested alerts in
`docs/OPERATIONS.md`. In production every log line is a JSON object (NestJS `ConsoleLogger` with
`json: true`); requests slower than 1 s are logged with their route pattern (never the query
string, so no user input is logged).

## 32. Failure handling

| Failure | Behaviour |
|---|---|
| GDELT unavailable / throttling | jobs back off (Redis slot penalty, exponential retries); overlap windows and slice auto-resume recover the gap |
| Malformed GDELT data | plain-text errors classified; invalid JSON items skipped and counted; bad records rejected by normalisation |
| Same article repeatedly | canonical URL constraint → `existing`; no re-index unless status changes |
| PostgreSQL down | readiness 503; jobs fail and retry; nothing is written elsewhere |
| Redis down | API serves uncached, rate limiter skips; queues pause and resume on reconnect |
| OpenSearch down | search falls back to PostgreSQL trigram search (`degraded: true`); outbox accumulates |
| Index lost | relay rebuilds from PostgreSQL automatically |
| Indexing job fails | outbox rows stay pending; per-document failures retried 10×, then admin retry |
| Queue growth | visible in metrics/admin; scheduled jobs outrank backfill |
| Excess traffic | per-IP rate limit, Redis cache, Caddy timeouts, body limits |
| VPS restart | `restart: unless-stopped`; backfills resume from PostgreSQL slice state |
| Disk 80 % / 90 % | warning / backfills paused + retention |
| Source URL dead / URL changed | links point to publishers; a new URL is a new canonical URL and is caught as a title duplicate |
| Syndicated content | near-duplicate detection keeps one representative, others shown as "also reported by" |

## 33. Data retention

Accepted articles: kept (metadata only). Rejected: 30 days. Duplicates: 60 days. Provider
metadata: 30 days. Ingestion runs: 90 days. Processed outbox: 7 days. Finished backfill slices:
30 days after completion. Expired sessions: daily. `OPENSEARCH_RETENTION_DAYS` can make the search
window smaller than PostgreSQL's if the index ever outgrows the disk.

## 34. Copyright and attribution

Stored/shown: headline, publisher, timestamp, original URL, categories. No article bodies are
stored or republished; images are not displayed. Every card and detail screen names the publisher
and links to the original. **Must be checked before commercial deployment** (not legal advice):
GDELT terms of use and attribution, whether headline display is acceptable in target
jurisdictions, publisher opt-out handling (block via admin sources), app store content policies,
and any future use of thumbnails or snippets.

## 35. Open source repository architecture

```
apps/backend        NestJS API + worker, migrations, Dockerfile
apps/mobile         Expo React Native app
packages/shared     API contract types (type-only)
infrastructure      compose files, OpenSearch image, Caddy, scripts
docs                architecture, operations, API
```
Apache-2.0. Real `.env` files and backups are git-ignored.

## 36. Admin architecture

`/api/v1/admin/*` (admin role): list/inspect articles with relevance signals and duplicates,
approve/reject (manual override), set categories, create/edit GDELT queries and relevance rules
(regex validated), manage sources (trust/block), ingestion runs and 24 h summary, run ingestion
now, create/resume/cancel backfills, indexing status, reindex, retry failed outbox, queue stats,
retry failed jobs, dead letters, audit log. No AI moderation.

## 37. Future translation extension

Optional, not installed: `article_translations` table, a `translation` queue and worker that
reads accepted English articles and writes Tamil title/description, API `?lang=ta` returning the
translation when present, and Tamil fields in a new OpenSearch index version. Nothing in the
current pipeline depends on it.

## 38. Future AI extension

Possible later, behind the same interfaces: an additional relevance signal next to the rules,
summaries stored as separate fields, entity extraction feeding `entities`, event clustering on top
of `duplicate_of_id`, semantic search in a separate index. None of it is required or present.

## 39. Multi-niche architecture

Niches are rows: each has its own queries, relevance rules, thresholds and anchor; articles carry
`niche_id` (unique per niche + URL) and OpenSearch filters on `niche`. The API accepts `?niche=`
(default `tn-cm`). Categories are shared. Adding "Tamil Nadu Education" is data, not code.

## 40. Scalability roadmap

1. **One VPS** (now).
2. **Bigger VPS** when OpenSearch heap >75 % sustained, swap in use, or p95 API latency >300 ms.
3. **Managed/dedicated PostgreSQL** when the DB competes with OpenSearch for RAM or backups need PITR.
4. **Dedicated OpenSearch** when the index exceeds a few GB or search QPS needs >1 node (then add a replica).
5. **Separate worker host** when ingestion/backfills affect API latency.
6. **Multiple API instances** behind Caddy when a single Node process is CPU-bound; the API is stateless.
No microservices or Kubernetes until these steps are exhausted.

## 41. Cost architecture

Software licences: all open source (NestJS, Fastify, PostgreSQL, Redis, BullMQ, OpenSearch,
React Native/Expo). GDELT: free public data, subject to its terms. Translation/AI: ₹0 (none).
Recurring infrastructure: the OVH VPS; add off-site backup storage (a few GB), domain, optional
uptime monitoring, app store accounts (Google one-time, Apple yearly). Later: larger VPS,
dedicated database/search, CDN, translation infrastructure.

## 42. MVP implementation phases (status)

1 Infrastructure ✔ · 2 Schema ✔ · 3 GDELT ingestion ✔ · 4 Normalisation ✔ · 5 Dedup ✔ ·
6 Relevance ✔ · 7 Categories ✔ · 8 OpenSearch ✔ · 9 Indexing pipeline ✔ · 10 Search API ✔ ·
11 Feed API ✔ · 12 Redis caching ✔ · 13 React Native app ✔ · 14 Bookmarks/auth ✔ · 15 Admin API ✔
(UI later) · 16 Monitoring ✔ · 17 Backups ✔ · 18 Hardening ✔ (see OPERATIONS for host steps).

## 43. Testing strategy

Unit tests (`npm test`): URL canonicalisation, text cleanup, normaliser, relevance engine incl.
real-data regressions, quality filter, classifier, GKG/DOC parsing. Verified end to end against
real PostgreSQL/Redis/OpenSearch and live GDELT: ingestion, dedup, indexing, search, pagination,
auth, bookmarks, admin moderation → index removal, OpenSearch outage (fallback + outbox drain),
lost index rebuild, Redis outage, backup restore. Integration suite
(`src/test/pipeline.integration.spec.ts`, runs in CI against PostgreSQL in a throwaway schema):
idempotent re-ingestion with URL variants, syndication dedup, relevance rejection, category/source
keyset pagination, PostgreSQL search fallback, rescoring stability. Still to add: mobile component
tests and on-device testing.

## 44. Risks and mitigations

| Risk | Mitigation |
|---|---|
| GDELT throttling/outage | GKG archive path, Redis-serialised DOC calls, backoff, overlap, auto-resume |
| OpenSearch memory on 4 GB | lean image, 768 MB heap, 1.5 GB limit, PostgreSQL fallback, rebuildable |
| Relevance false positives/negatives | explainable signals, review queue, admin overrides, rule edits + rescore |
| Disk exhaustion | metadata only, retention, disk checks, log rotation, off-site backups |
| Copyright complaints | headlines + links only, attribution, source blocking |
| Single point of failure | backups + documented rebuild; scale path above |

## 45. Recommended development order

Already followed: schema → ingestion → pipeline → indexing → API → app → ops. Next: admin UI,
CI with integration tests, load testing, production monitoring stack, app store release.

## 46. Final architecture decision

A NestJS modular monolith with a PostgreSQL source of truth, a rebuildable single-node OpenSearch
index fed by a transactional outbox, BullMQ/Redis for work and caching, deterministic
GDELT-only ingestion, and a black-and-white React Native client, running on one Compose-managed VPS.

---

# FINAL ARCHITECTURE

```
                GDELT
                   |
                   v
            GDELT Ingestion
                   |
                   v
             Normalization
                   |
                   v
           Relevance Engine
                   |
                   v
           Deduplication
                   |
                   v
            Quality Filter
                   |
                   v
              PostgreSQL
              /        \
             /          \
            v            v
      OpenSearch       BullMQ
          |              |
          |            Redis
          |
          v
     Search / Feed
          |
          v
   NestJS + Fastify API
          |
          v
     React Native App
```

- **Runs continuously:** Caddy, API, worker, PostgreSQL, Redis, OpenSearch.
- **Runs periodically:** ingestion cycle (30 min), outbox relay (30 s), disk check (10 min),
  backfill auto-resume (30 min), retention (daily 03:00 IST), backups (cron).
- **Asynchronous:** GDELT fetches, article processing, indexing, reindex, rescoring, retention.
- **Cached:** API responses in Redis (60–600 s); news on the phone (7 days).
- **Persistent:** PostgreSQL (all data), Redis AOF (queue state), OpenSearch volume (derived).
- **Source of truth:** PostgreSQL. **Derived index:** OpenSearch.
- **OpenSearch fails:** search uses the PostgreSQL fallback, browsing is unaffected, changes wait
  in the outbox; a lost index is rebuilt from PostgreSQL automatically.
- **Redis fails:** API keeps serving from PostgreSQL/OpenSearch without cache or rate-limit store;
  background jobs pause and resume when Redis returns (AOF keeps queued jobs).
- **GDELT fails:** the app keeps serving stored news; jobs back off and retry; overlapping windows
  and backfill slices fill the gap once GDELT recovers.
- **Recovery:** restart policies, idempotent jobs, resumable slices, outbox replay, automatic
  index rebuild, and PostgreSQL restore from off-site backups.
