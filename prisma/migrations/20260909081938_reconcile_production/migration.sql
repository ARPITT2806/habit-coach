-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiConsentAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationExpires" TIMESTAMP(3),
ADD COLUMN     "emailVerificationToken" TEXT,
ADD COLUMN     "emailVerified" TIMESTAMP(3),
ADD COLUMN     "image" TEXT,
ADD COLUMN     "passwordResetExpires" TIMESTAMP(3),
ADD COLUMN     "passwordResetToken" TEXT,
ADD COLUMN     "provider" TEXT DEFAULT 'email',
ADD COLUMN     "providerId" TEXT;

-- CreateTable
CREATE TABLE "CoachUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "windowType" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachUsage_userId_windowStart_idx" ON "CoachUsage"("userId", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "CoachUsage_userId_windowType_windowStart_key" ON "CoachUsage"("userId", "windowType", "windowStart");

-- AddForeignKey
ALTER TABLE "CoachUsage" ADD CONSTRAINT "CoachUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

