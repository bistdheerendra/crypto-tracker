-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "verdictId" TEXT NOT NULL,
    "note" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_verdictId_key" ON "journal_entries"("verdictId");
