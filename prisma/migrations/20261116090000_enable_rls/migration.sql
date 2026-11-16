-- Supabase exposes the public schema through its REST API (PostgREST). With RLS enabled and no
-- policies, the anon and authenticated roles can't read or write these tables. The app connects as
-- the table owner, which RLS doesn't apply to, so it's unaffected. Harmless on plain Postgres.
ALTER TABLE "videos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comment_analyses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analysis_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
