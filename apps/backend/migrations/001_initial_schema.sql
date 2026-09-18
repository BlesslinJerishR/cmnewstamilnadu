-- Initial schema. PostgreSQL is the system of record; OpenSearch is derived from these tables.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- A niche is a configurable topic (the first one is the Tamil Nadu Chief Minister).
CREATE TABLE niches (
  id               smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name             text NOT NULL,
  description      text,
  enabled          boolean NOT NULL DEFAULT true,
  accept_threshold numeric(5,2) NOT NULL DEFAULT 50,
  review_threshold numeric(5,2) NOT NULL DEFAULT 30,
  relevance_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (review_threshold <= accept_threshold)
);

-- GDELT DOC API query definitions, managed by admins, never by the mobile app.
CREATE TABLE gdelt_queries (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  niche_id         smallint NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
  name             text NOT NULL,
  query_text       text NOT NULL,
  source_language  text NOT NULL DEFAULT 'english',
  priority         smallint NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  enabled          boolean NOT NULL DEFAULT true,
  window_minutes   integer NOT NULL DEFAULT 180 CHECK (window_minutes BETWEEN 15 AND 10080),
  max_results      smallint NOT NULL DEFAULT 250 CHECK (max_results BETWEEN 1 AND 250),
  relevance_weight numeric(5,2) NOT NULL DEFAULT 20,
  last_run_at      timestamptz,
  last_success_at  timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (niche_id, name)
);

-- Deterministic relevance rules. Negative weights are negative signals.
CREATE TABLE relevance_rules (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  niche_id     smallint NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
  name         text NOT NULL,
  rule_type    text NOT NULL CHECK (rule_type IN ('phrase', 'regex', 'proximity')),
  pattern      text NOT NULL,
  pattern_b    text,
  max_distance smallint CHECK (max_distance BETWEEN 1 AND 50),
  fields       text[] NOT NULL DEFAULT '{title,description,url,entities}',
  weight       numeric(6,2) NOT NULL CHECK (weight BETWEEN -100 AND 100),
  enabled      boolean NOT NULL DEFAULT true,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (niche_id, name),
  CHECK (fields <@ ARRAY['title','description','url','entities']::text[] AND cardinality(fields) > 0),
  CHECK (rule_type <> 'proximity' OR (pattern_b IS NOT NULL AND max_distance IS NOT NULL))
);

CREATE TABLE sources (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain        text NOT NULL UNIQUE,
  name          text NOT NULL,
  country       text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trusted', 'blocked')),
  trust_weight  numeric(5,2) NOT NULL DEFAULT 0 CHECK (trust_weight BETWEEN -50 AND 50),
  homepage_url  text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id              smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug            text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name            text NOT NULL,
  description     text,
  sort_order      smallint NOT NULL DEFAULT 100,
  is_feed_section boolean NOT NULL DEFAULT false,
  enabled         boolean NOT NULL DEFAULT true,
  min_score       numeric(5,2) NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE category_rules (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id smallint NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  rule_type   text NOT NULL CHECK (rule_type IN ('phrase', 'regex')),
  pattern     text NOT NULL,
  fields      text[] NOT NULL DEFAULT '{title,description,url}',
  weight      numeric(5,2) NOT NULL DEFAULT 1,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, rule_type, pattern)
);

-- Canonical internal article model. Only metadata is stored, never full publisher text.
CREATE TABLE articles (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  niche_id          smallint NOT NULL REFERENCES niches(id),
  source_id         integer REFERENCES sources(id) ON DELETE SET NULL,
  provider          text NOT NULL,
  provider_ref      text,
  original_url      text NOT NULL,
  canonical_url     text NOT NULL,
  url_hash          char(64) NOT NULL,
  title             text NOT NULL,
  normalized_title  text NOT NULL,
  title_hash        char(64) NOT NULL,
  description       text,
  image_url         text,
  author            text,
  language          text NOT NULL,
  source_domain     text NOT NULL,
  source_name       text NOT NULL,
  source_country    text,
  published_at      timestamptz NOT NULL,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL CHECK (status IN ('accepted', 'pending_review', 'rejected', 'duplicate')),
  relevance_score   numeric(5,2) NOT NULL DEFAULT 0,
  relevance_status  text NOT NULL CHECK (relevance_status IN ('relevant', 'review', 'irrelevant')),
  relevance_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  quality_status    text NOT NULL CHECK (quality_status IN ('accepted', 'pending_review', 'rejected')),
  quality_reasons   text[] NOT NULL DEFAULT '{}',
  duplicate_of_id   bigint REFERENCES articles(id) ON DELETE SET NULL,
  duplicate_reason  text,
  manual_status     text CHECK (manual_status IN ('accepted', 'rejected')),
  manual_categories boolean NOT NULL DEFAULT false,
  matched_query_ids integer[] NOT NULL DEFAULT '{}',
  entities          text,
  provider_metadata jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (niche_id, url_hash),
  CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id)
);

CREATE INDEX articles_public_feed_idx ON articles (niche_id, published_at DESC, id DESC) WHERE status = 'accepted';
CREATE INDEX articles_title_hash_idx ON articles (niche_id, title_hash);
CREATE INDEX articles_title_trgm_idx ON articles USING gin (normalized_title gin_trgm_ops);
CREATE INDEX articles_status_created_idx ON articles (status, created_at);
CREATE INDEX articles_duplicate_of_idx ON articles (duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;
CREATE INDEX articles_source_idx ON articles (source_id, published_at DESC);
CREATE INDEX articles_published_idx ON articles (niche_id, published_at);

CREATE TABLE article_categories (
  article_id  bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  category_id smallint NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  score       numeric(6,2) NOT NULL DEFAULT 0,
  assigned_by text NOT NULL DEFAULT 'rule' CHECK (assigned_by IN ('rule', 'manual')),
  PRIMARY KEY (article_id, category_id)
);
CREATE INDEX article_categories_category_idx ON article_categories (category_id, article_id);

CREATE TABLE ingestion_runs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  niche_id     smallint REFERENCES niches(id) ON DELETE SET NULL,
  query_id     integer REFERENCES gdelt_queries(id) ON DELETE SET NULL,
  kind         text NOT NULL CHECK (kind IN ('scheduled', 'backfill', 'manual')),
  provider     text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end   timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'split')),
  fetched      integer NOT NULL DEFAULT 0,
  accepted     integer NOT NULL DEFAULT 0,
  pending      integer NOT NULL DEFAULT 0,
  rejected     integer NOT NULL DEFAULT 0,
  duplicates   integer NOT NULL DEFAULT 0,
  existing     integer NOT NULL DEFAULT 0,
  invalid      integer NOT NULL DEFAULT 0,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  duration_ms  integer
);
CREATE INDEX ingestion_runs_started_idx ON ingestion_runs (started_at DESC);
CREATE INDEX ingestion_runs_query_idx ON ingestion_runs (query_id, started_at DESC);

CREATE TABLE backfills (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  niche_id     smallint NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
  range_start  timestamptz NOT NULL,
  range_end    timestamptz NOT NULL,
  strategy     text NOT NULL CHECK (strategy IN ('auto', 'doc', 'gkg')),
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  total_slices integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (range_start < range_end)
);

CREATE TABLE backfill_slices (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  backfill_id integer NOT NULL REFERENCES backfills(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('gdelt-doc', 'gdelt-gkg')),
  query_id    integer REFERENCES gdelt_queries(id) ON DELETE CASCADE,
  slice_start timestamptz NOT NULL,
  slice_end   timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  attempts    smallint NOT NULL DEFAULT 0,
  fetched     integer NOT NULL DEFAULT 0,
  matched     integer NOT NULL DEFAULT 0,
  error       text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX backfill_slices_unique_idx ON backfill_slices (backfill_id, provider, COALESCE(query_id, 0), slice_start);
CREATE INDEX backfill_slices_status_idx ON backfill_slices (backfill_id, status);

-- Transactional outbox: every change that affects the public search index writes a row here
-- in the same transaction as the article change. The indexing worker drains it.
CREATE TABLE search_outbox (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id   bigint NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts     smallint NOT NULL DEFAULT 0,
  last_error   text
);
CREATE INDEX search_outbox_pending_idx ON search_outbox (id) WHERE processed_at IS NULL;
CREATE INDEX search_outbox_processed_idx ON search_outbox (processed_at) WHERE processed_at IS NOT NULL;

CREATE TABLE users (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL,
  password_hash text NOT NULL,
  display_name  text,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  disabled      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_idx ON users (lower(email));

CREATE TABLE sessions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   char(64) NOT NULL UNIQUE,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE bookmarks (
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id bigint NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, article_id)
);
CREATE INDEX bookmarks_user_created_idx ON bookmarks (user_id, created_at DESC, article_id DESC);

-- Jobs that exhausted all retries. Kept for inspection and manual retry from the admin API.
CREATE TABLE dead_letter_jobs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  queue         text NOT NULL,
  job_name      text NOT NULL,
  job_id        text,
  data          jsonb,
  failed_reason text,
  attempts      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
CREATE INDEX dead_letter_jobs_open_idx ON dead_letter_jobs (created_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE system_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  details    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
