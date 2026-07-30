-- Additive instrumentation tables (no changes to verdicts / verdict_features).

CREATE TABLE IF NOT EXISTS "regime_snapshots" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "volatilityRatio" DOUBLE PRECISION NOT NULL,
    "rangeBoundPct" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regime_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "regime_snapshots_pair_computedAt_idx"
  ON "regime_snapshots"("pair", "computedAt");

CREATE TABLE IF NOT EXISTS "lane_health_logs" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT,
    "errorDetail" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lane_health_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "lane_health_logs_pair_recordedAt_idx"
  ON "lane_health_logs"("pair", "recordedAt");
