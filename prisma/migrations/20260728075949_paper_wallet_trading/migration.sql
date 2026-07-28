/*
  Warnings:

  - Made the column `realizedPnl` on table `positions` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill nulls before making realizedPnl required
UPDATE "positions" SET "realizedPnl" = 0 WHERE "realizedPnl" IS NULL;

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "closedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'open',
ALTER COLUMN "realizedPnl" SET NOT NULL,
ALTER COLUMN "realizedPnl" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "paper_wallet" (
    "id" TEXT NOT NULL,
    "startingBalance" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "cashBalance" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_wallet_pkey" PRIMARY KEY ("id")
);
