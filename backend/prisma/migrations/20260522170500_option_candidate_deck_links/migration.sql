-- AlterTable
ALTER TABLE "pms_option_candidates" ADD COLUMN     "bookUrl" TEXT,
ADD COLUMN     "modelsComUrl" TEXT,
ADD COLUMN     "pdfFilename" TEXT,
ADD COLUMN     "pdfPublicToken" TEXT,
ADD COLUMN     "pdfSizeBytes" INTEGER,
ADD COLUMN     "pdfStoredPath" TEXT,
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "socialUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pms_option_candidates_pdfPublicToken_key" ON "pms_option_candidates"("pdfPublicToken");
