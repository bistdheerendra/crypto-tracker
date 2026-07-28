-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN "exitedAt" TIMESTAMP(3),
ADD COLUMN "exitPrice" DOUBLE PRECISION,
ADD COLUMN "exitRMultiple" DOUBLE PRECISION;
