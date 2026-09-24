/*
  Warnings:

  - You are about to drop the `entity_review_queue` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "entity_review_queue" DROP CONSTRAINT "entity_review_queue_extractedEntityId_fkey";

-- DropForeignKey
ALTER TABLE "entity_review_queue" DROP CONSTRAINT "entity_review_queue_reviewedById_fkey";

-- DropTable
DROP TABLE "entity_review_queue";

-- CreateTable
CREATE TABLE "resolved_entities" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resolved_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_resolution_candidates" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "memberEntityIds" TEXT[],
    "matchScore" DOUBLE PRECISION NOT NULL,
    "decision" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_resolution_candidates_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "extracted_entities" ADD CONSTRAINT "extracted_entities_resolvedEntityId_fkey" FOREIGN KEY ("resolvedEntityId") REFERENCES "resolved_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_resolution_candidates" ADD CONSTRAINT "entity_resolution_candidates_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_resolution_candidates" ADD CONSTRAINT "entity_resolution_candidates_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
