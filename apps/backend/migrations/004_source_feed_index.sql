-- Performance (2026-09 audit):
-- 1. Publisher pages (GET /news?source=<domain>) filtered accepted articles by source_domain
--    with a full table scan (59 ms on 29k rows, growing linearly). A partial index matching the
--    query's filter and keyset order makes it an index range scan.
-- 2. ingestion_runs_query_idx was never used by any query (0 scans) but was written on every
--    ingestion run; no code path looks runs up by query_id alone.
CREATE INDEX IF NOT EXISTS articles_source_feed_idx
    ON articles (niche_id, source_domain, published_at DESC, id DESC)
 WHERE status = 'accepted';

DROP INDEX IF EXISTS ingestion_runs_query_idx;
