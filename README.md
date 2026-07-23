# DeepCurrent

Crypto trading intelligence — market move ke peeche ka cause dikhata hai, sirf price chart nahi.

UI brand: **Dheerendra Intelligence**. Informational tool only — not financial advice. No pricing / paywall / tokens.

## What it does

1. **4-lane analysis** (Technical, Flow, Narrative, Macro) → one synthesized **Verdict** (direction, confidence, entry / SL / TP)
2. **Radar** — whales, ETF flows, liquidations, news
3. **Backtest** — persist → resolve → track record + equity simulator
4. **Scenarios** — BTC-shock portfolio stress test
5. **Copilot** — chat with live price + LLM (Anthropic) when key is set

## Tech stack

| Layer | Tech |
|--------|------|
| App | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, Framer Motion, Lucide |
| Charts | lightweight-charts, Recharts |
| DB | PostgreSQL (Supabase) + Prisma 7 |
| Data | Binance, Yahoo, CoinGecko, RSS, Blockchair, OKX, SoSoValue (optional) |

## Getting started

```bash
npm install
cp .env.example .env          # set DATABASE_URL + DIRECT_URL for durable verdicts
npm run db:migrate            # optional but recommended for backtest history
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without a real `DATABASE_URL`, the app still runs; verdicts stay in **process memory** (lost on restart).

## Main routes

| Path | Purpose |
|------|---------|
| `/` | Marketing landing |
| `/app/dashboard` | Live prices + multi-pair signals |
| `/app/analyze` | Run 4-lane pipeline |
| `/app/charts` | Live candles + verdict card |
| `/app/radar` | Whales / ETF / liquidations |
| `/app/backtest` | Track record + simulator |
| `/app/scenarios` | Portfolio stress test |
| `/app/copilot` | Chat UI |
| `/app/settings` | Preferences (client-side) |

## API (overview)

| Method | Path | Role |
|--------|------|------|
| GET | `/api/analyze` | 4 lanes + verdict |
| GET | `/api/market` | Live price |
| GET | `/api/klines` | Candles for charts |
| GET | `/api/radar?type=…` | news / whales / liquidations / etf |
| POST | `/api/copilot` | Chat reply + price context |
| GET/POST | `/api/backtest/*` | Track record + simulate |
| GET | `/api/health` | Ops snapshot (DB, backtest, env presence) |
| GET/POST | `/api/cron/resolve-verdicts` | Resolve open verdict outcomes |
| GET/POST | `/api/cron/generate-verdicts` | Auto-analyze all tracked pairs × timeframes |
| GET/POST | `/api/cron/check-alerts` | Radar spike → Telegram |
| GET/PUT | `/api/settings` | Alert preferences |
| POST | `/api/settings/test-telegram` | Test Telegram alert |

## Cron scheduling

`vercel.json` lists **daily** Vercel Cron entries only. On the Hobby plan, Vercel Cron
cannot run more often than once per day, so those entries are a **safety-net fallback**
— not the primary schedule.

Frequent runs are handled by **GitHub Actions** (see [`docs/CRON.md`](./docs/CRON.md))
and/or [cron-job.org](https://cron-job.org):

| Job | Production URL | Suggested schedule | Auth |
|-----|----------------|--------------------|------|
| Resolve open verdicts | `GET https://<domain>/api/cron/resolve-verdicts` | every **15 min** | `Authorization: Bearer <CRON_SECRET>` if set |
| Generate new verdicts | `GET https://<domain>/api/cron/generate-verdicts` | every **3 hours** | same |
| Radar / Telegram alerts | `GET https://<domain>/api/cron/check-alerts` | every **10–15 min** | same |

**GitHub Actions secrets:** `CRON_BASE_URL`, `CRON_SECRET`  
Workflow: `.github/workflows/frequent-cron.yml`

Vercel fallback schedules in `vercel.json`:
- `/api/cron/resolve-verdicts` → `0 0 * * *` (00:00 UTC daily)
- `/api/cron/generate-verdicts` → `0 1 * * *` (01:00 UTC daily)
- `/api/cron/check-alerts` → `0 2 * * *` (02:00 UTC daily)

All crons are idempotent; overlapping Vercel + external hits are safe.

Radar deep-dive: [`docs/INSTITUTIONAL-RADAR.md`](./docs/INSTITUTIONAL-RADAR.md)  
Cron setup: [`docs/CRON.md`](./docs/CRON.md)

## Documentation

**Complete architecture:** [`docs/PROJECT.md`](./docs/PROJECT.md)

Env templates: [`.env.example`](./.env.example)

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local Next.js |
| `npm run build` | Generate Prisma client + production build |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:studio` | Browse DB |
| `npm run extract-training-data` | Export resolved verdicts + features for ML |

## Disclaimer

Crypto trading intelligence. Not financial advice.
