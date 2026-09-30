# Frequent Dheerendra Intelligence crons (Hobby Vercel = daily max)

Vercel Cron on Hobby can only run **once per day**. Dense track-record
needs more frequent hits — use **GitHub Actions** (this repo) and/or
[cron-job.org](https://cron-job.org).

## Recommended schedule

| Job | Path | Interval |
|-----|------|----------|
| Resolve open verdicts | `/api/cron/resolve-verdicts` | every **30 min** |
| Generate new verdicts | `/api/cron/generate-verdicts` | every **3 hours** |
| Radar → Telegram alerts | `/api/cron/check-alerts` | every **30 min** |

Intervals are tuned to stay within Supabase Free-plan egress (5 GB/month).
Do **not** run both GitHub Actions and cron-job.org for the same path — pick one.

All routes accept `GET` or `POST` and optional auth:

```http
Authorization: Bearer <CRON_SECRET>
```

## Option A — GitHub Actions (included)

Workflow: [`.github/workflows/frequent-cron.yml`](../.github/workflows/frequent-cron.yml)

**Repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Example |
|--------|---------|
| `CRON_BASE_URL` | Render origin, e.g. `https://YOUR-SERVICE.onrender.com` (no trailing slash). This workflow does not hard-code the host. |
| `CRON_SECRET` | same value as `CRON_SECRET` on that service |

Enable Actions on the repo; the workflow runs on schedule automatically.

Point `CRON_BASE_URL` at one origin only. Once the Render web service is the host you want these jobs to hit, set it to that Render URL. `vercel.json` still calls the Vercel deployment on its own daily schedule until that Vercel project is removed. Do not add cron-job.org for the same paths.

## Option B — cron-job.org

Create 3 jobs pointing at production:

1. `GET https://<domain>/api/cron/resolve-verdicts` — every 30 minutes  
2. `GET https://<domain>/api/cron/generate-verdicts` — every 3 hours  
3. `GET https://<domain>/api/cron/check-alerts` — every 30 minutes  

Header: `Authorization: Bearer <CRON_SECRET>`

## Vercel daily fallback

`vercel.json` still runs each job once daily as a safety net if external
schedulers miss.

## Manual smoke test

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<domain>/api/cron/resolve-verdicts"
```
