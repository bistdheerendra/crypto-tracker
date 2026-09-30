# Deploy crypto-tracker on Render Free

This app stays a Next.js 16 App Router Node server. Render runs `npm run build` and `npm run start`. There is no static export and no Cloudflare Workers build.

`vercel.json` is still in the repo. Leave the existing Vercel project in place until the Render service has been checked.

## 1. Create a Render account

Sign up at [https://render.com](https://render.com). The free web-service plan is enough for this Blueprint (`plan: free` in `render.yaml`).

## 2. Connect GitHub

In the Render dashboard, connect the GitHub account that owns `bistdheerendra/crypto-tracker` and grant access to that repository.

## 3. Select the repository

Choose `bistdheerendra/crypto-tracker`, branch `main`.

You can create the service from the Blueprint (`render.yaml` at the repo root) or create a Web Service manually with the same settings as below. The Blueprint sets `plan: free`. Do not switch the instance type to Starter or higher unless you intend to pay.

## 4. Service type

Web Service.

## 5. Runtime

Node.

`render.yaml` sets `NODE_VERSION` to `22.14.0`. Node 22 has the global `WebSocket` API the liquidation collector uses. Next.js 16 requires Node `>= 20.9`.

## 6. Build command

```bash
npm run build
```

That script is `prisma generate && next build`. Render also runs `npm install`, which runs `postinstall` (`prisma generate`). Both `DATABASE_URL` and `DIRECT_URL` must be set on the service before the first build so Prisma's config can load. Generate does not apply migrations.

## 7. Start command

```bash
npm run start
```

That script is `next start -H 0.0.0.0`. Next.js reads `PORT` from the environment. Render sets `PORT`. The process listens on all interfaces so Render's proxy can connect.

## 8. Environment variables

Add these in the Render Environment tab. Use the same values as the current Vercel project. Do not paste them into git.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | App runtime Postgres (Supabase transaction pooler, port 6543). Used by `src/lib/db.ts`. |
| `DIRECT_URL` | Yes | Prisma CLI / `prisma.config.ts` (Supabase session pooler, port 5432). Needed at build time for `prisma generate`. Not used as the app pool. |
| `CRON_SECRET` | Yes for protected cron | `Authorization: Bearer <CRON_SECRET>` on `/api/cron/*`. |
| `SOSOVALUE_API_KEY` | No | ETF flows. Falls back to a Yahoo proxy. |
| `BLOCKCHAIR_API_KEY` | No | Whale API. Falls back to Blockstream / Blockscout. |
| `WHALE_CAPTURE_ENABLED` | No | Set to `true` only if whale feature capture should run on analyze and generate-verdicts. Default off. |
| `UPSTASH_REDIS_REST_URL` | No | Radar and backtest cache. Falls back to memory. |
| `UPSTASH_REDIS_REST_TOKEN` | No | Pair with the Upstash URL. |
| `GEMINI_API_KEY` | No | Copilot. Preferred LLM. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | Alternate name for the Gemini key. Either one is enough. |
| `ANTHROPIC_API_KEY` | No | Copilot paid fallback. |
| `TELEGRAM_BOT_TOKEN` | No | Alert delivery. |
| `TELEGRAM_CHAT_ID` | No | Default Telegram chat. |

`ML_EDGE_DEBUG=1` exists for local ONNX logging only. Do not set it in production.

Render marks Blueprint keys with `sync: false` as values you must enter in the dashboard. Leave an optional key blank if you are not using that integration. An empty optional key does not change fallback behavior.

## 9. Health check path

```text
/api/health
```

`GET /api/health` returns JSON. It reports whether the database is configured and whether each integration key is present. It does not return secret values, connection strings, or key contents. The HTTP status is 200 even when a dependency check fails, so Render can mark the process alive. Read `database.connected` in the body when you want to confirm Supabase.

## 10. Render URL

After the first successful deploy, open the service in the Render dashboard. The public origin is on the service page, for example:

```text
https://crypto-tracker.onrender.com
```

The real host can differ (Render appends a suffix when the name is taken). Copy the origin with no trailing slash. That value is `CRON_BASE_URL`. Do not commit it.

## 11. GitHub Actions `CRON_BASE_URL`

Frequent cron stays in `.github/workflows/frequent-cron.yml`. The workflow already calls:

```text
${CRON_BASE_URL}/api/cron/resolve-verdicts
${CRON_BASE_URL}/api/cron/generate-verdicts
${CRON_BASE_URL}/api/cron/check-alerts
```

It sends `Authorization: Bearer <CRON_SECRET>` when that secret is set.

In GitHub: Settings → Secrets and variables → Actions.

| Secret | Value |
|---|---|
| `CRON_BASE_URL` | Render origin only, no path and no trailing slash |
| `CRON_SECRET` | Same string as Render `CRON_SECRET` |

Do not point this secret at the Vercel URL and a second scheduler at Render. One frequent scheduler, one origin. `vercel.json` still triggers the Vercel deployment once a day until you delete that Vercel project. Those daily calls are the existing fallback, not a second copy of the GitHub schedule. Do not also enable cron-job.org for the same three paths.

## 12. Test cron endpoints

Wait until the service is awake (see cold starts below), then:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR-SERVICE.onrender.com/api/health"

curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "https://YOUR-SERVICE.onrender.com/api/cron/check-alerts"
```

`check-alerts` is the smallest of the three jobs. `resolve-verdicts` and `generate-verdicts` are safe to call, and they are idempotent, but generate analyzes every tracked pair and timeframe and can take several minutes. A manual GitHub Actions run (`workflow_dispatch`) hits the same routes through `CRON_BASE_URL`.

If `CRON_SECRET` is unset, the routes accept unauthenticated calls. Set it in production.

## 13. Verify Prisma and Supabase

1. Confirm Render has `DATABASE_URL` (port 6543, `pgbouncer=true`) and `DIRECT_URL` (port 5432).
2. Open `GET /api/health` and check `database.connected` is `true` and `verdictCount` is a number.
3. This deploy does not run `prisma migrate`. Schema changes stay a manual step (`npm run db:migrate` against `DIRECT_URL`) from a trusted machine. Do not run reset or other destructive Prisma commands against production.

## 14. Verify ML / ONNX

`/api/analyze` loads `ml/models/baseline_classifier.onnx` plus `feature_medians.json` and `feature_columns.json`, and the WASM files under `ml/ort-wasm/`. Those files are tracked in git. Paths are `process.cwd()` plus `ml/...`, which is the repository root on Render.

Call:

```text
GET /api/analyze?pair=BTC/USDT&timeframe=1h
```

A non-neutral verdict can include `mlEdge` (`winProbability`, `modelVersion`). `mlEdge: null` on a neutral verdict is normal. `mlEdge: null` on a directional verdict means ONNX failed; the rest of the analysis response is still returned.

`ml/predict.py` is a local fallback used only when ONNX returns nothing and `VERCEL` is not set. Render's Node image does not need Python. If `python` / `python3` is missing, the fallback returns null and does not crash the server. Do not add a Python buildpack unless you intend to use that fallback.

## 15. Verify WebSockets

Server-side liquidation collection opens a short-lived outbound WebSocket from the Node process (`src/lib/radar/websocket-utils.ts`). It is not a public WebSocket server. Render Free supports a long-running Node process, which is what this client needs.

Check:

```text
GET /api/radar?type=liquidations
```

The browser also opens Binance WebSockets directly from `/app/charts` and the live price hooks. Those connections go to Binance, not to Render.

## 16. Cold starts

Render Free web services spin down after a period with no incoming traffic. The next request waits while the process boots. That can take tens of seconds, and the first `/api/analyze` or cron call can time out at the client while the service is still starting. Retry once the dashboard shows the service as live.

Nothing in this repo pings the service to keep it awake. After a cold start the app behaves the same: Prisma reconnects, ONNX loads from the files on disk, and in-memory caches are empty until the next request fills them. Upstash, when configured, still holds the shared cache.

GitHub Actions cron can be the request that wakes the service. If a scheduled run fails on a cold start, re-run that workflow after the service is up.

## 17. Keep Vercel until Render is verified

Leave the Vercel project and `vercel.json` as they are while you test Render.

Check all of the following on the Render URL before changing DNS or removing Vercel:

- `/` and the `/app/*` pages listed in the README load
- `/api/health` shows `database.connected: true`
- `/api/analyze` returns a verdict
- `/api/market`, `/api/klines`, and `/api/radar` respond
- one authenticated cron call succeeds
- GitHub `CRON_BASE_URL` points at Render, not at both hosts

After that, `vercel.json` can be removed and the Vercel project can be deleted. Until then, deleting `vercel.json` only drops Vercel's daily cron; it does not deploy this app to Render. Removing the Vercel project is what stops the old host. Do both only after the checklist above passes, so you do not run the GitHub schedule against Render and the Vercel daily cron against a second copy of the same jobs longer than you mean to.

## Local commands before you push

```bash
npm install
npx prisma generate
npm run build
npm run start
```

`npm run start` listens on `0.0.0.0` and on `PORT` (default 3000).
