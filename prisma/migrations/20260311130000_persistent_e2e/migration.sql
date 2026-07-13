-- AlterTable
ALTER TABLE "PersistentRoom" ADD COLUMN "e2eSalt" TEXT,
ADD COLUMN "e2eVerifier" TEXT;

-- AlterTable: widen message text for AES-GCM ciphertext
ALTER TABLE "PersistentMessage" ALTER COLUMN "text" SET DATA TYPE TEXT;
