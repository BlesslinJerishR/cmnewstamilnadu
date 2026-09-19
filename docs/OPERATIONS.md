# Operations runbook

Target: one OVHcloud VPS-1 (2 vCPU, 4 GB RAM, 40 GB NVMe), Ubuntu/Debian, Docker Compose.

## 1. Prepare the server (once)

```bash
# Updates, firewall, Docker
sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw fail2ban unattended-upgrades rclone
curl -fsSL https://get.docker.com | sudo sh

# Firewall: SSH, HTTP, HTTPS only
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable

# SSH hardening: keys only, no root login (keep your current session open while testing!)
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl reload ssh

# 2 GB swap: headroom for memory spikes on a 4 GB machine
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/60-swappiness.conf

# Required by OpenSearch (mmap)
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/60-opensearch.conf
sudo sysctl --system
```

Docker publishes ports by editing iptables directly, bypassing ufw. Only Caddy publishes ports in
this stack, so that is intended; never add `ports:` to PostgreSQL, Redis or OpenSearch.

## 2. Deploy

```bash
sudo mkdir -p /opt/cmnews && sudo chown $USER /opt/cmnews
git clone https://github.com/BlesslinJerishR/CmNewsTamilnadu.git /opt/cmnews
cd /opt/cmnews/infrastructure
cp .env.production.example .env
# Edit .env: API_DOMAIN, ACME_EMAIL, long random POSTGRES_PASSWORD / REDIS_PASSWORD / METRICS_TOKEN
#   openssl rand -base64 36
chmod 600 .env
docker compose up -d --build
docker compose ps
curl -s https://$API_DOMAIN/health/ready
```

Point the domain's DNS A/AAAA record at the VPS before starting; Caddy obtains certificates
automatically.

On first start the worker applies migrations, seeds the niche, creates the search index, starts
30-minute ingestion and creates the initial backfill (`INITIAL_BACKFILL_FROM/TO`, IST dates).
Follow progress:

```bash
docker compose exec worker node dist/cli.js backfill-status
docker compose logs -f worker
```

The GKG part of a 4½-month backfill downloads ~13 000 files (~3–5 MB each, streamed, nothing kept
on disk) and takes a few hours with `GDELT_GKG_CONCURRENCY=2`.

Create an administrator:

```bash
docker compose exec -e ADMIN_PASSWORD='a-long-unique-password' worker node dist/cli.js create-admin --email you@example.org
```

## 3. Update

```bash
cd /opt/cmnews && git pull
cd infrastructure && docker compose up -d --build
```

Migrations run automatically (advisory-locked). Seed data is additive and never overwrites admin
edits; changed seed rules ship as migrations (see `002_refine_vijay_rules.sql`). After changing
relevance or category rules: `docker compose exec worker node dist/cli.js rescore`.

## 4. Backups

```bash
rclone config          # create a remote, e.g. "offsite" (OVH Object Storage / any S3)
crontab -e
# 03:30 IST daily
30 22 * * * cd /opt/cmnews && BACKUP_REMOTE=offsite:cmnews-backups infrastructure/scripts/backup-postgres.sh >> /var/log/cmnews-backup.log 2>&1
# monthly restore test
0 23 1 * * cd /opt/cmnews && infrastructure/scripts/restore-test.sh >> /var/log/cmnews-backup.log 2>&1
```

OpenSearch is not backed up: it is rebuilt from PostgreSQL.

## 5. Recovery procedures

| Situation | Action |
|---|---|
| Search index lost/corrupt | automatic on next relay; or `docker compose exec worker node dist/cli.js reindex` |
| Database lost | `rclone copy offsite:cmnews-backups/daily/<file> infrastructure/backup/` then `infrastructure/scripts/restore-postgres.sh backup/<file>` |
| Redis data lost | restart; scheduled jobs are re-registered on worker start, unfinished backfill slices are re-queued from PostgreSQL |
| Backfill stuck/failed slices | `node dist/cli.js backfill-resume --id <id>` (also automatic every 30 min) |
| GDELT throttling (`rate limit` in logs) | nothing to do; requests pause 5 min and retry. Avoid manual GDELT calls from the same IP |
| Disk ≥ 90 % | backfills pause automatically; check `docker system df`, prune old images (`docker image prune`), lower retention |
| Bad article visible | `PATCH /api/v1/admin/articles/<id> {"status":"rejected"}` (removed from search within seconds) |
| Problematic publisher | `PATCH /api/v1/admin/sources/<id> {"status":"blocked"}` (its articles are re-evaluated and hidden) |

## 6. Monitoring

- Uptime: an external checker on `https://$API_DOMAIN/health/ready` (expects 200 and `"status":"ok"`).
- Metrics: scrape `http://api:3000/metrics` from inside the Docker network with
  `Authorization: Bearer $METRICS_TOKEN` (Caddy blocks it publicly). A lightweight option is a
  Grafana Cloud agent or Netdata on a second small machine; do not add Prometheus/Grafana to the
  4 GB VPS itself.
- Suggested alerts:
  - `cmnews_last_successful_scheduled_ingestion_age_seconds > 7200`
  - `cmnews_search_outbox{state="pending"} > 500` for 15 min, or `{state="failed"} > 0`
  - `cmnews_opensearch{stat="heap_used_percent"} > 85` for 10 min, `{stat="up"} == 0`
  - `cmnews_disk_used_percent > 80`
  - `cmnews_redis_used_memory_bytes > 150e6`
  - `cmnews_queue_jobs{state="failed"}` increasing; HTTP 5xx rate; p95 latency > 500 ms
- Logs: production logs are one JSON object per line, e.g.
  `docker compose logs worker | grep '"level":"error"'`; slow requests (>1 s) appear as
  `Slow request GET /api/v1/... <ms>`.
- Quick checks: `docker stats --no-stream`, `docker compose exec worker node dist/cli.js backfill-status`,
  `GET /api/v1/admin/indexing/status`, `GET /api/v1/admin/ingestion/summary`.

## 7. Local development

```bash
npm install                                     # backend + shared workspaces
docker compose -f infrastructure/docker-compose.dev.yml up -d
cp apps/backend/.env.example apps/backend/.env.development
npm run build
cd apps/backend
set -a; . ./.env.development; set +a
node dist/cli.js migrate
node dist/main.js     # API on :3000
node dist/worker.js   # worker (separate terminal)
npm test                                        # unit tests
INTEGRATION_DATABASE_URL=$DATABASE_URL npm test # + pipeline tests in a throwaway schema

cd ../mobile && npm install
npx expo start   # Expo Go uses this computer's LAN IP on port 3000 for the API
```

Set `INITIAL_BACKFILL_FROM=` (empty) locally if you do not want the historical download.
