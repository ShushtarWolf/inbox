-- DropForeignKey
ALTER TABLE "ClubWorker" DROP CONSTRAINT IF EXISTS "ClubWorker_membershipId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "ClubWorker_membershipId_key";

-- AlterTable
ALTER TABLE "ClubWorker" DROP COLUMN IF EXISTS "email";
ALTER TABLE "ClubWorker" DROP COLUMN IF EXISTS "membershipId";
ALTER TABLE "ClubWorker" DROP COLUMN IF EXISTS "role";
ALTER TABLE "ClubWorker" DROP COLUMN IF EXISTS "permissionsJson";

ALTER TABLE "ClubWorker" ADD COLUMN IF NOT EXISTS "position" TEXT NOT NULL DEFAULT 'RECEPTION';
ALTER TABLE "ClubWorker" ADD COLUMN IF NOT EXISTS "accessAreasJson" TEXT;
