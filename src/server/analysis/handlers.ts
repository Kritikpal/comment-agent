import { ApiError } from "../errors.ts"
import { enforceRateLimit, respond } from "../http.ts"
import { requireVideoId } from "../videos/handlers.ts"
import type { AnalysisRepository } from "./repository.ts"
import { executeAnalysis, startAnalysis, type Analyzer } from "./run.ts"

export interface AnalysisHandlerDeps {
  repo: AnalysisRepository
  /** Lazily built: only starting a run needs the Groq key. */
  analyzer: () => Analyzer
  /** Runs work after the response is sent (Next.js `after()` in production). */
  schedule: (task: () => Promise<void>) => void
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** POST /api/v1/videos/:id/analyses — claims a run, answers 202 at once, and classifies in the background. */
export function handleStartAnalysis(request: Request, id: string, deps: AnalysisHandlerDeps): Promise<Response> {
  return respond(async () => {
    enforceRateLimit(request)
    const videoId = requireVideoId(id)
    const analyzer = deps.analyzer()
    const run = await startAnalysis(videoId, { store: deps.repo, analyzer })
    deps.schedule(() => executeAnalysis(run.id, videoId, { store: deps.repo, analyzer }))
    return Response.json(run, { status: 202 })
  })
}

/** GET /api/v1/analyses/:runId — progress while running, report once READY. */
export function handleGetRun(runId: string, deps: AnalysisHandlerDeps): Promise<Response> {
  return respond(async () => {
    const run = UUID.test(runId) ? await deps.repo.getRun(runId.toLowerCase()) : null
    if (!run) throw new ApiError("NOT_FOUND", "Analysis run not found.")
    return Response.json(run)
  })
}

/** GET /api/v1/videos/:id/analyses/latest — the current run (any state) and the latest report. */
export function handleLatestAnalysis(id: string, deps: AnalysisHandlerDeps): Promise<Response> {
  return respond(async () => {
    const videoId = requireVideoId(id)
    if (!(await deps.repo.getProduct(videoId))) throw new ApiError("NOT_FOUND", "Video not found.")
    return Response.json(await deps.repo.latest(videoId))
  })
}
