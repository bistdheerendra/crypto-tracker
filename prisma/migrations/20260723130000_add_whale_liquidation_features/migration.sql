-- AlterTable
ALTER TABLE "verdict_features" ADD COLUMN "whaleNetFlowUsd" DOUBLE PRECISION,
ADD COLUMN "whaleTransactionCount" INTEGER,
ADD COLUMN "liquidationNetImbalanceUsd" DOUBLE PRECISION,
ADD COLUMN "liquidationVolumeUsd" DOUBLE PRECISION;
