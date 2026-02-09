-- AlterTable
ALTER TABLE "GlobalKnowledge" ADD COLUMN "lastVerified" TIMESTAMP(3);
CREATE INDEX "GlobalKnowledge_userId_verified_lastVerified_idx" ON "GlobalKnowledge"("userId", "verified", "lastVerified");
