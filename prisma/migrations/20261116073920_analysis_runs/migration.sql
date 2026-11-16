-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('positive', 'negative', 'neutral', 'mixed');

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('appreciative', 'excited', 'frustrated', 'critical', 'curious', 'sarcastic', 'neutral');

-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('praise', 'complaint', 'question', 'suggestion', 'request', 'other');

-- CreateEnum
CREATE TYPE "PurchaseIntent" AS ENUM ('none', 'considering', 'ready_to_buy');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "comment_analyses" (
    "comment_id" TEXT NOT NULL,
    "analyzer_version" TEXT NOT NULL,
    "video_id" UUID NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "tone" "Tone" NOT NULL,
    "intents" "Intent"[],
    "purchase_intent" "PurchaseIntent" NOT NULL,
    "feedback" JSONB NOT NULL,
    "questions" TEXT[],
    "model" TEXT NOT NULL,
    "analyzed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comment_analyses_pkey" PRIMARY KEY ("comment_id","analyzer_version")
);

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "analyzer_version" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "comments_total" INTEGER NOT NULL DEFAULT 0,
    "comments_classified" INTEGER NOT NULL DEFAULT 0,
    "comments_failed" INTEGER NOT NULL DEFAULT 0,
    "tokens_in" INTEGER NOT NULL DEFAULT 0,
    "tokens_out" INTEGER NOT NULL DEFAULT 0,
    "report" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comment_analyses_video_id_analyzer_version_sentiment_idx" ON "comment_analyses"("video_id", "analyzer_version", "sentiment");

-- CreateIndex
CREATE INDEX "analysis_runs_video_id_created_at_idx" ON "analysis_runs"("video_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "comment_analyses" ADD CONSTRAINT "comment_analyses_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_analyses" ADD CONSTRAINT "comment_analyses_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One active (PENDING or RUNNING) analysis per video. Prisma can't express partial indexes, so it lives here.
CREATE UNIQUE INDEX "analysis_runs_one_active_per_video" ON "analysis_runs" ("video_id") WHERE "status" IN ('PENDING', 'RUNNING');
