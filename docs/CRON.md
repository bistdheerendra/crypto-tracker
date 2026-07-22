# Frequent DeepCurrent crons (Hobby Vercel = daily max)

Vercel Cron on Hobby can only run **once per day**. Dense track-record
needs more frequent hits — use **GitHub Actions** (this repo) and/or
[cron-job.org](https://cron-job.org).

## Recommended schedule

| Job | Path | Interval |
|-----|------|----------|
| Resolve open verdicts | `/api/cron/resolve-verdicts` | every **15 min** |
| Generate new verdicts | `/api/cron/generate-verdicts` | every **30 min** |
| Radar → Telegram alerts | `/api/cron/check-alerts` | every **10–15 min** |

All routes accept `GET` or `POST` and optional auth:

```http
Authorization: Bearer <CRON_SECRET>
```

## Option A — GitHub Actions (included)

Workflow: [`.github/workflows/frequent-cron.yml`](../.github/workflows/frequent-cron.yml)

**Repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Example |
|--------|---------|
| `CRON_BASE_URL` | `https://your-app.vercel.app` (no trailing slash) |
| `CRON_SECRET` | same value as Vercel `CRON_SECRET` env |

Enable Actions on the repo; the workflow runs on schedule automatically.

## Option B — cron-job.org

Create 3 jobs pointing at production:

1. `GET https://<domain>/api/cron/resolve-verdicts` — every 15 minutes  
2. `GET https://<domain>/api/cron/generate-verdicts` — every 30 minutes  
3. `GET https://<domain>/api/cron/check-alerts` — every 10–15 minutes  

Header: `Authorization: Bearer <CRON_SECRET>`

## Vercel daily fallback

`vercel.json` still runs each job once daily as a safety net if external
schedulers miss.

## Manual smoke test

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<domain>/api/cron/resolve-verdicts"
```
