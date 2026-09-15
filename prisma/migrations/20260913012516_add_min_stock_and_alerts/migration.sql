-- AlterTable
ALTER TABLE "Phone" ADD COLUMN     "minStock" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "phoneId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_phoneId_idx" ON "Alert"("phoneId");

-- CreateIndex
CREATE INDEX "Alert_isResolved_idx" ON "Alert"("isResolved");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_phoneId_type_key" ON "Alert"("phoneId", "type");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_phoneId_fkey" FOREIGN KEY ("phoneId") REFERENCES "Phone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
