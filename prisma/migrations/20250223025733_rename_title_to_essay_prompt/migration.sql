/*
  Warnings:

  - You are about to drop the column `title` on the `Essay` table. All the data in the column will be lost.
  - Added the required column `essayPrompt` to the `Essay` table without a default value. This is not possible if the table is not empty.
  - Added the required column `prompt` to the `Essay` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Essay" DROP COLUMN "title",
ADD COLUMN     "essayPrompt" TEXT NOT NULL,
ADD COLUMN     "prompt" TEXT NOT NULL;
