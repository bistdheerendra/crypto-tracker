-- CreateTable
CREATE TABLE "verdicts" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "confidenceTier" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit1" DOUBLE PRECISION NOT NULL,
    "takeProfit2" DOUBLE PRECISION NOT NULL,
    "laneBiasTechnical" TEXT NOT NULL,
    "laneBiasFlow" TEXT NOT NULL,
    "laneBiasNarrative" TEXT NOT NULL,
    "laneBiasMacro" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT,
    "outcomePrice" DOUBLE PRECISION,
    "outcomeAt" TIMESTAMP(3),
    "rMultiple" DOUBLE PRECISION,

    CONSTRAINT "verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verdict_features" (
    "id" TEXT NOT NULL,
    "verdictId" TEXT NOT NULL,
    "ema50" DOUBLE PRECISION,
    "ema200" DOUBLE PRECISION,
    "rsi14" DOUBLE PRECISION,
    "priceDistanceToEma50Pct" DOUBLE PRECISION,
    "distanceToNearestSwingPct" DOUBLE PRECISION,
    "oiChangePct" DOUBLE PRECISION,
    "fundingRate" DOUBLE PRECISION,
    "longShortRatio" DOUBLE PRECISION,
    "price24hChangePct" DOUBLE PRECISION,
    "fearGreedIndex" DOUBLE PRECISION,
    "globalMcapChangePct" DOUBLE PRECISION,
    "trendingScore" DOUBLE PRECISION,
    "dxyChangePct" DOUBLE PRECISION,
    "spxChangePct" DOUBLE PRECISION,
    "goldChangePct" DOUBLE PRECISION,
    "confidenceTier" TEXT NOT NULL,
    "laneAgreementCount" INTEGER NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "hourOfDay" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verdict_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verdicts_pair_createdAt_idx" ON "verdicts"("pair", "createdAt");

-- CreateIndex
CREATE INDEX "verdicts_outcome_idx" ON "verdicts"("outcome");

-- CreateIndex
CREATE INDEX "verdicts_createdAt_idx" ON "verdicts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "verdict_features_verdictId_key" ON "verdict_features"("verdictId");

-- CreateIndex
CREATE INDEX "verdict_features_pair_createdAt_idx" ON "verdict_features"("pair", "createdAt");

-- AddForeignKey
ALTER TABLE "verdict_features" ADD CONSTRAINT "verdict_features_verdictId_fkey" FOREIGN KEY ("verdictId") REFERENCES "verdicts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
