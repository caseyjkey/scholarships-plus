/*
  Warnings:

  - You are about to drop the column `prompt` on the `Essay` table. All the data in the column will be lost.
  - Added the required column `essay` to the `Essay` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Essay" DROP COLUMN "prompt",
ADD COLUMN     "essay" TEXT NOT NULL;
