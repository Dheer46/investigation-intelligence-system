-- CreateEnum
CREATE TYPE "UsbTokenStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedAuthAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "pinHash" TEXT;

-- CreateTable
CREATE TABLE "usb_tokens" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "UsbTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "usb_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "embeddingEncrypted" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "biometric_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usb_tokens_tokenId_key" ON "usb_tokens"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "biometric_templates_userId_key" ON "biometric_templates"("userId");

-- AddForeignKey
ALTER TABLE "usb_tokens" ADD CONSTRAINT "usb_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_templates" ADD CONSTRAINT "biometric_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
