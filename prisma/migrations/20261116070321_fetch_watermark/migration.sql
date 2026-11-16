-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "fetched_through" TIMESTAMP(3),
ADD COLUMN     "last_fetch_note" TEXT;

-- Backfill: existing videos have stored everything since their newest comment.
UPDATE "videos" v
   SET "fetched_through" = (SELECT max(c."published_at") FROM "comments" c WHERE c."video_id" = v."id");
