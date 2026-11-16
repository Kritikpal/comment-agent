-- CreateEnum
CREATE TYPE "FetchStatus" AS ENUM ('PENDING', 'FETCHING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "videos" (
    "id" UUID NOT NULL,
    "youtube_video_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "channel_title" TEXT,
    "thumbnail_url" TEXT,
    "product_name" TEXT NOT NULL,
    "product_category" TEXT,
    "notes" TEXT,
    "comment_limit" INTEGER NOT NULL DEFAULT 100,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "fetch_status" "FetchStatus" NOT NULL DEFAULT 'PENDING',
    "fetch_started_at" TIMESTAMP(3),
    "last_fetched_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "video_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "author_name" TEXT,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3) NOT NULL,
    "youtube_updated_at" TIMESTAMP(3),
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "videos_youtube_video_id_key" ON "videos"("youtube_video_id");

-- CreateIndex
CREATE INDEX "videos_created_at_id_idx" ON "videos"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "comments_video_id_published_at_id_idx" ON "comments"("video_id", "published_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
