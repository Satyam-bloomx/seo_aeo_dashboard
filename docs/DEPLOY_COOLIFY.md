# Deploying on Coolify (Hostinger VPS)

How the team deploys, scales, monitors, backs up and rolls back the app. It covers Phase 4 of
`docs/ROADMAP_RELIABILITY.md`.

**Production data lives in the `postgres` container on the VPS disk (volume `postgres_data`), not in Supabase.**
Supabase handles sign-in only (and is the development database).

## 1. What runs

| Service | Image | Role | Exposed |
|---|---|---|---|
| `frontend` | `frontend/Dockerfile` | Next.js. Proxies `/api/*` to `http://backend:8000` | port 3000 (Coolify domain) |
| `backend` | `backend/Dockerfile` | The API (uvicorn). Runs `alembic upgrade head` on start (`RUN_MIGRATIONS=true`). With `CRAWL_RUNNER=inline` it also runs crawls | internal only |
| `worker` | same backend image, `python -m app.worker` | Runs crawls when `CRAWL_RUNNER=worker`; idles otherwise | nothing |
| `postgres` | `postgres:16-alpine` | Production database (volume `postgres_data`) | internal network only |
| `redis` | `redis:7.4-alpine` | Optional today; kept for the future shared queue | internal network only |

Start order (enforced by `depends_on`): postgres healthy → backend migrates, then becomes healthy → worker and
frontend start. The worker never migrates.

## 2. Coolify resource setup (once)

1. Coolify → **Projects → + New → Resource → Docker Compose** (from the Git repository), branch `main`,
   *Docker Compose Location* `/docker-compose.yml`, build pack **Docker Compose**.
2. **Domains**: set the public domain on the `frontend` service only (e.g. `https://audit.example.com`, port 3000).
   Leave `backend`, `worker`, `postgres` and `redis` without domains. The browser reaches the API through the
   frontend's `/api` proxy (same origin, no CORS).
3. **Environment variables**: fill in the table in section 3. Coolify lists every `${VAR}` it found in the compose
   file; the ones marked `:?` are required and the deploy fails clearly if they are empty.
   Mark `NEXT_PUBLIC_*` variables as **Build Variables** (they are baked into the browser bundle).
4. Leave *Pre-deployment / Post-deployment commands* empty: migrations run in the backend entrypoint.
5. Deploy. Watch the `backend` logs for the `migrate:` lines (section 4).

## 3. Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `POSTGRES_PASSWORD` | yes | | Long random string. Changing it later needs `ALTER USER` inside Postgres too |
| `POSTGRES_USER` / `POSTGRES_DB` | no | `seo_audit` | Only read when the volume is first created |
| `REDIS_PASSWORD` | yes | | Long random string |
| `ENCRYPTION_KEY` | yes | | Fernet key; encrypts stored API keys / OAuth tokens. **Back it up separately**: a DB backup is useless without it |
| `ENCRYPTION_KEYS_PREVIOUS` | no | empty | Old keys during a rotation |
| `CORS_ORIGINS` | yes | | Exact frontend origin(s), e.g. `https://audit.example.com` |
| `FRONTEND_URL` | yes | | Frontend origin (Google OAuth return URL) |
| `SUPABASE_URL` | yes | | Sign-in (JWKS) |
| `SUPABASE_JWT_SECRET` | no | empty | Only for legacy HS256 projects |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes (build) | | Browser sign-in |
| `NEXT_PUBLIC_SITE_URL` | yes (build) | `http://localhost:3000` | Public site URL |
| `NEXT_PUBLIC_API_URL` | no (build) | `/api` | Keep `/api` |
| `CRAWL_RUNNER` | no | `inline` | `inline` or `worker` (section 6). Same value for backend and worker |
| `CRAWL_SLOTS` / `JS_CRAWL_SLOTS` | no | `3` / `1` | Crawls at once. KVM 2: `2` / `1` |
| `MAX_CRAWL_PAGES` | no | `1000` | Page limit per crawl |
| `ALERT_WEBHOOK_URL` | no | empty | Slack or Discord webhook for crawl alerts (section 8) |
| `RUN_MIGRATIONS` | no | `true` (backend) | Set `false` only to deploy code without migrating (not recommended) |
| `MIGRATIONS_BASELINE` | no | empty | One-time, see 4.2 |
| `LOG_LEVEL` | no | `INFO` | |
| `CRAWLER_USER_AGENT` | no | `AuditProBot/1.0 (+https://auditpro.ai/bot)` | What clients allowlist with the IP |
| `WORKER_GRACE_SECONDS` | no | `100` | Time running crawls get to finish on redeploy. Keep below the worker's `stop_grace_period` (120 s) |
| `WORKER_MAX_MEMORY_PCT` | no | `75` | Worker stops claiming new crawls above this share of its memory limit |
| `FRONTEND_CPUS/MEMORY`, `API_CPUS/MEMORY`, `API_SHM_SIZE`, `WORKER_CPUS/MEMORY`, `POSTGRES_CPUS/MEMORY` | no | KVM 4 values | Section 7 |
| `GEMINI_API_KEY`, `PAGESPEED_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `SERPAPI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | empty | Platform fallbacks when a workspace has not connected its own |

Advanced worker settings (rarely changed): `WORKER_HEARTBEAT_SECONDS` (15), `WORKER_STALE_SECONDS` (180),
`STUCK_CRAWL_HOURS` (2), `WORKER_POLL_SECONDS` (2). To use them, add them to the worker's `environment` in the compose file.

## 4. Migrations on deploy

`backend/docker-entrypoint.sh` runs before uvicorn when `RUN_MIGRATIONS=true` (backend service only):

1. Waits for Postgres (up to 60 s), takes the advisory lock `pg_try_advisory_lock(815203771)` (a second container
   starting at the same moment waits, then finds nothing to do; it gives up after `MIGRATION_LOCK_TIMEOUT_SECONDS`, 300).
2. Logs the current revision, runs `alembic upgrade head`, logs the new revision, releases the lock.
3. On any failure it logs `FATAL: database migration failed; not starting the service` and exits. The new backend
   never becomes healthy, so Coolify marks the deploy failed and the **old containers keep serving**.

Expected log on a good deploy:

```
entrypoint: RUN_MIGRATIONS=true: applying database migrations (alembic upgrade head)
migrate: migration lock acquired
migrate: current revision: d4e5f6a7b8c9
migrate: alembic upgrade head
migrate: database is at revision e5f6a7b8c9d0
entrypoint: migrations complete
```

### 4.1 Verify the revision

Coolify → resource → `backend` → **Terminal** (or SSH: `docker exec -it <backend-container> sh`):

```sh
python -m alembic current      # expect: e5f6a7b8c9d0 (head)
python -m alembic history | head
```

### 4.2 First deploy on the existing production database (one time)

Production Postgres has not been migrated before, and its tables were probably created by the app itself
(`create_all`), so it may have **no `alembic_version` table**. Upgrading from zero would then fail on
`CREATE TABLE projects`, so the entrypoint stops with:
`ERROR: the database has tables but no Alembic revision ... set MIGRATIONS_BASELINE`.

To fix it (human decision; take a backup first, section 9):

1. In the postgres container: `psql -U seo_audit -d seo_audit -c '\dt'` and `\d crawls`.
2. If the tables `projects`, `crawls`, `pages`, `links`, `images` **and** `integrations` exist, the right baseline is
   `2ce62ee1d4c3`. The later migrations (`c3d4e5f6a7b8`, `d4e5f6a7b8c9`, `e5f6a7b8c9d0`) check what exists before
   changing anything, so they are safe on a drifted database. If `integrations` is missing, use `a7f5e35e73a6`.
3. Set `MIGRATIONS_BASELINE=2ce62ee1d4c3` in Coolify, deploy, confirm `database is at revision e5f6a7b8c9d0`,
   then **delete `MIGRATIONS_BASELINE`** (it is ignored once a revision exists, but should not linger).
4. Known risk: `c3d4e5f6a7b8` adds unique indexes (`uq_projects_user_id`, `uq_pages_crawl_url`, ...). If duplicate
   rows exist, the migration fails and the old containers keep running; remove the duplicates and redeploy.

Migration `e5f6a7b8c9d0` (links stored on pages) must run before the new code serves traffic. The entrypoint
guarantees that order.

## 5. Daily deploys

Push to `main` → Coolify builds both images (the worker reuses the backend build cache) → backend migrates →
health checks pass → old containers are stopped.

On redeploy, the worker receives SIGTERM: it stops claiming, gives running crawls up to `WORKER_GRACE_SECONDS`
(100 s) to finish, then marks the rest failed with "The crawl worker was stopped (redeploy or restart) before the
crawl finished. Please start the audit again." Queued crawls stay queued and the new worker picks them up.
Prefer deploying when no long crawl is running.

## 6. Switching crawls to the worker (`CRAWL_RUNNER=worker`)

`app/worker.py` is ready. **Before switching, the three API changes in 6.2 must be deployed**; without them the
API keeps running crawls in-process while the worker claims the same rows, and a crawl can run twice.

### 6.1 Steps

1. Deploy the 6.2 changes with `CRAWL_RUNNER=inline` (no behaviour change).
2. Wait until no crawl is running (or accept that running ones are failed by the API restart).
3. In Coolify set `CRAWL_RUNNER=worker`, `API_CPUS=1.0`, `API_MEMORY=1536m`, `API_SHM_SIZE=64mb`. Redeploy.
4. Check the worker log: `Crawl worker <host:pid> started: 3 normal + 1 JavaScript slots, database postgresql`.
5. Start a crawl in the app: the worker logs `Claimed crawl N (normal) https://...` and later `Crawl N finished: completed in 95 s`.

Going back: set `CRAWL_RUNNER=inline` and restore the API limits. The worker then idles.

### 6.2 API changes required (owned by the app engineer)

`app/services/crawl_queue.py`, add next to `_int_env`:

```python
CRAWL_RUNNER = (os.getenv("CRAWL_RUNNER") or "inline").strip().lower()
```

`app/main.py`, in `lifespan`: wrap the "mark running crawls failed" block **and** the `requeue_waiting_crawls()`
block in `if CRAWL_RUNNER != "worker":` (import `CRAWL_RUNNER` from `app.services.crawl_queue`). In worker mode
the API must not touch crawl state on start-up: the worker recovers its own crashed crawls by heartbeat age.

`app/api/endpoints.py`:

```python
from app.services.crawl_queue import CRAWL_RUNNER, CrawlJob, crawl_queue

def enqueue_crawl(crawl_id, seed_url, request):
    if CRAWL_RUNNER == "worker":
        return  # the row is already "queued"; a worker claims it from the database
    crawl_queue.enqueue(...)  # unchanged
```

and in `get_crawl_status`, compute the queue position from the database in worker mode:

```python
if crawl.status == "queued" and CRAWL_RUNNER == "worker":
    js = bool(((crawl.summary or {}).get("request") or {}).get("js_rendering")) and crawl.mode != "page"
    rows = (await db.execute(select(Crawl.mode, Crawl.summary).where(
        Crawl.status == "queued", Crawl.id <= crawl.id))).all()
    queue_position = sum(1 for mode, s in rows
                         if (bool(((s or {}).get("request") or {}).get("js_rendering")) and mode != "page") == js)
else:
    ...existing in-process logic...
```

Nothing else changes: deleting a crawl row (Clear, or a newer crawl replacing a queued one) is enough. The worker
skips deleted queued rows and cancels a running crawl whose row disappeared within one heartbeat (15 s).

### 6.3 How the worker works

- **Claiming**: `UPDATE crawls SET status='running', summary.worker_id/worker_heartbeat=... WHERE id = (SELECT id
  FROM crawls WHERE status='queued' AND <normal|JS> ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING ...`.
  Any number of workers can run; each crawl is claimed once. JS = `summary.request.js_rendering` and mode ≠ page.
- **Slots**: `CRAWL_SLOTS` normal + `JS_CRAWL_SLOTS` JS per worker process.
- **Memory valve**: above `WORKER_MAX_MEMORY_PCT` (75 %) of the container limit, no new crawl starts.
- **Heartbeat**: every 15 s, `summary.worker_heartbeat` (unix time) is updated atomically (`jsonb_set`).
- **Recovery**: a `running` crawl whose heartbeat is older than 180 s (and stays unchanged for another 35 s) is
  marked failed: "The crawl worker running this crawl stopped responding". This covers OOM kills and host reboots.
- **Time limit**: crawls running longer than `STUCK_CRAWL_HOURS` (2 h) are stopped and marked failed.
- **Shutdown**: section 5. Failure reasons are stored in `summary.failed_reason`.
- **Health**: the worker writes the time to `/tmp/worker-heartbeat` after every successful database poll; the
  healthcheck fails if it is older than 90 s (database unreachable or the loop is stuck).

## 7. Sizing: KVM 4 vs KVM 2

Coolify itself uses ~1-2 GB, the OS ~1 GB. CPU limits may add up to more than the host (they are ceilings);
memory ceilings of the services doing work must fit.

| Setting | KVM 4 (4 vCPU / 16 GB), recommended | KVM 2 (2 vCPU / 8 GB) |
|---|---|---|
| `CRAWL_SLOTS` / `JS_CRAWL_SLOTS` | 3 / 1 | 2 / 1 |
| `FRONTEND_CPUS` / `FRONTEND_MEMORY` | 1.0 / 1g | 0.75 / 768m |
| `API_CPUS` / `API_MEMORY`, inline mode | 2.0 / 3g (default) | 1.5 / 2560m |
| `API_CPUS` / `API_MEMORY` / `API_SHM_SIZE`, worker mode | 1.0 / 1536m / 64mb | 0.75 / 1g / 64mb |
| `WORKER_CPUS` / `WORKER_MEMORY`, worker mode | 3.0 / 6g (default) | 1.5 / 3g |
| `WORKER_MEMORY`, inline mode (worker idles) | 6g is fine (uses ~150 MB) | set 512m |
| `POSTGRES_CPUS` / `POSTGRES_MEMORY` | 1.5 / 2g (default) | 1.0 / 1g |
| Redis | 0.5 / 256m | same |
| Memory ceilings in use (worker mode) | ~10.8 GB | ~5.8 GB |

Postgres connections: each backend process has a pool of up to 35 connections (API + worker = 70, default
`max_connections` is 100). A second worker service would need `max_connections` raised or a smaller pool.

More capacity: raise slots on KVM 4 only after the load test (section 11) passes with headroom; beyond that,
move to KVM 8 and add a second worker service (copy the `worker` block as `worker2`).

## 8. Health checks and notifications

- Health checks (compose): `backend` → `GET /health`; `worker` → heartbeat file; `frontend` → any non-5xx on `/`;
  `postgres` → `pg_isready`; `redis` → `PING`. Coolify shows each container's state and uses the backend check to
  decide whether a deploy succeeded. Note: Docker does not restart a container just because it is *unhealthy*;
  restarts happen when the process exits (`restart: unless-stopped`). Unhealthy = investigate.
- **Coolify notifications**: Coolify → *Notifications* → enable Discord (webhook URL), Telegram (bot token +
  chat id) and/or Email (SMTP or Resend). Tick: *Deployment success/failure*, *Container status changes*
  (stopped/restarted), *Backup success/failure*, *Server disk usage* and *Server unreachable*. Send a test message.
- **Crawl alerts**: set `ALERT_WEBHOOK_URL` to a Slack incoming webhook or a Discord channel webhook. One grouped
  message per crawl with problems (dead-lettered URLs, circuit breaker, failed crawl). Every alert is also logged
  with the `[CRAWL-ALERT]` prefix, so it shows in Coolify logs even without a webhook.
- Logs: every container uses `json-file` with 10 MB × 5 rotation, so logs never fill the disk.

## 9. Backups and restore

Back up **both** the database and `ENCRYPTION_KEY` (in the team password manager). Without the key, stored
integration tokens cannot be decrypted after a restore.

### 9.1 Option A: Coolify scheduled backups (preferred where available)

Coolify's built-in scheduled backups (with S3 upload and retention) are available for databases Coolify manages.
In a Docker Compose resource, open the `postgres` service: if it has a **Backups** tab, use it. If it does not
(Coolify treats compose apps and one-click services differently, depending on version), use option B, or
move the database to a standalone Coolify PostgreSQL resource (human decision, a migration of its own).

1. Coolify → *Storages* (S3) → add S3-compatible storage (Hostinger Object Storage, Backblaze B2, Cloudflare R2,
   AWS S3): endpoint, bucket, region, access key, secret. Click *Validate*.
2. `postgres` → *Backups* → *+ Add*: frequency `0 3 * * *` (daily 03:00 UTC), databases `seo_audit`,
   *Save to S3* on with the storage above, keep **7** locally and **7** on S3. Enable backup notifications.
3. Run *Backup Now* once and confirm the file appears in the bucket.

### 9.2 Option B: pg_dump from the host (cron)

On the VPS (as root), `/root/backup-seo-audit.sh`:

```sh
#!/bin/sh
set -eu
C=$(docker ps --filter "name=postgres" --filter "label=coolify.projectName" --format '{{.Names}}' | head -1)
F=/root/backups/seo_audit-$(date -u +%Y%m%d-%H%M).dump
mkdir -p /root/backups
docker exec "$C" pg_dump -U seo_audit -d seo_audit -Fc > "$F"
rclone copy "$F" s3remote:seo-audit-backups/      # rclone configured once with `rclone config`
ls -1t /root/backups/*.dump | tail -n +8 | xargs -r rm --   # keep 7 locally
rclone delete --min-age 8d s3remote:seo-audit-backups/       # keep ~7 on S3
```

Cron: `0 3 * * * /root/backup-seo-audit.sh >> /var/log/seo-backup.log 2>&1`. Check the container-name filter with
`docker ps` first (Coolify names containers `postgres-<uuid>`).

### 9.3 Restore (test once now, then quarterly)

Test without touching production by restoring into a scratch database in the same container:

```sh
C=<postgres container>
docker cp seo_audit-YYYYMMDD-HHMM.dump "$C":/tmp/r.dump
docker exec "$C" createdb -U seo_audit restore_test
docker exec "$C" pg_restore -U seo_audit -d restore_test --no-owner /tmp/r.dump
docker exec "$C" psql -U seo_audit -d restore_test -c "select version_num from alembic_version; select count(*) from crawls; select count(*) from projects;"
docker exec "$C" dropdb -U seo_audit restore_test
```

Pass: the restore has no errors, the revision matches `alembic current`, the counts are close to production.
Write the date and result in the team log.

Real restore (data loss or bad migration):

1. Coolify: stop `frontend`, `backend` and `worker` (leave `postgres` running).
2. `docker exec "$C" psql -U seo_audit -d postgres -c "DROP DATABASE seo_audit WITH (FORCE);" -c "CREATE DATABASE seo_audit OWNER seo_audit;"`
3. `docker exec "$C" pg_restore -U seo_audit -d seo_audit --no-owner /tmp/r.dump`
4. If the backup is from older code, deploy the matching commit (or let the entrypoint migrate forward), then start the services.

## 10. VPS public IP (client allowlisting)

Crawls leave from the VPS's fixed public IP. Find it once and share it with the `CRAWLER_USER_AGENT`:

```sh
curl -4 https://api.ipify.org                                   # on the VPS
docker exec <worker or backend container> python -c "import urllib.request;print(urllib.request.urlopen('https://api.ipify.org').read().decode())"
```

Both must match (the second proves container traffic leaves from the same IP). Hostinger hPanel → VPS →
Overview also shows it. Record it here: `VPS IP: ____________`.

## 11. Load test: 6 crawls at once

Goal (roadmap Phase 4): 6 people start crawls at once (mix of normal and JS) with no container restarts, API
p95 < 1 s and memory < 80 %.

Setup: 6 different accounts (one stored crawl per account; a second crawl from the same account replaces the
first). Pick 6 responsive sites of 300-1,000 pages; 4 normal and 2 with JavaScript rendering.

1. Before: on the VPS, `docker ps --format '{{.Names}} {{.Status}}'` and record restart counts:
   `for c in $(docker ps -q); do docker inspect -f '{{.Name}} {{.RestartCount}}' $c; done`.
2. Start monitors on the VPS:
   - `docker stats --format '{{.Name}} {{.CPUPerc}} {{.MemPerc}}' > stats.log &` (stop with `kill %1`)
   - Latency probe (an authenticated read the dashboard does constantly; copy a token from the browser dev tools):
     ```sh
     TOKEN=...; URL=https://audit.example.com/api/crawls/latest
     for i in $(seq 1 600); do curl -s -o /dev/null -w '%{time_total}\n' -H "Authorization: Bearer $TOKEN" $URL; sleep 1; done > lat.txt
     ```
3. All 6 people press *Start audit* within ~10 s. Expected with KVM 4 defaults: 3 normal + 1 JS run, 2 wait in
   the queue and show their position.
4. When all 6 finish: `sort -n lat.txt | awk '{a[NR]=$1} END {print "p95:", a[int(NR*0.95)]}'`; peak `MemPerc`
   per container from `stats.log`; restart counts again; `free -m` on the host.

Pass criteria:
- No container restarted (restart counts unchanged; no OOM in `dmesg | grep -i oom`).
- API p95 < 1 s for the whole run.
- Each container's memory stays < 80 % of its limit, and the host stays below 80 % used.
- All 6 crawls finish `completed` (or fail only for site-side reasons shown in the crawl).
- In worker mode, the worker log shows no "Memory at ... new crawls wait" for more than a few minutes.

If it fails: lower `CRAWL_SLOTS` by one (or `JS_CRAWL_SLOTS`), or raise `WORKER_MEMORY`, then rerun.

## 12. Rollback

- **Code only** (no new migration in the release): Coolify → resource → *Deployments* → pick the previous
  successful deployment → *Redeploy*. Or revert the commit on `main` and push.
- **Release with a migration**: migrations here are additive (new columns, dropped duplicate indexes), so the
  previous code normally runs on the newer schema; just redeploy the previous version. The entrypoint never
  downgrades. Only if the old code cannot work with the new schema: stop `backend`/`worker`, run
  `python -m alembic downgrade <previous revision>` in a one-off backend container (e.g. the Terminal of a
  backend container started with `RUN_MIGRATIONS=false`), then redeploy the old version. Note that downgrading
  `e5f6a7b8c9d0` discards the link data stored on pages since the upgrade.
- **Data problem**: restore the latest backup (9.3).
- **Worker split problem**: set `CRAWL_RUNNER=inline`, restore the inline API limits, redeploy.
