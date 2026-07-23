-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "assetSymbol" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "avgEntryPrice" DOUBLE PRECISION NOT NULL,
    "positionType" TEXT NOT NULL,
    "leverage" DOUBLE PRECISION,
    "entryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "positions_assetSymbol_idx" ON "positions"("assetSymbol");
