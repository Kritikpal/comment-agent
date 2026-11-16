import { getPrisma } from "../db/prisma.ts"
import { ApiError } from "../errors.ts"
import { createGroqAnalyzer } from "./analyzer.ts"
import { groqModel } from "./config.ts"
import type { AnalysisHandlerDeps } from "./handlers.ts"
import { createAnalysisRepository } from "./repository.ts"
import type { Analyzer } from "./run.ts"

export const analysisRepository = createAnalysisRepository(getPrisma)

let analyzer: Analyzer | null = null

function groqAnalyzer(): Analyzer {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new ApiError("UPSTREAM_ERROR", "The language model isn't configured on the server (GROQ_API_KEY).")
  analyzer ??= createGroqAnalyzer(apiKey, groqModel())
  return analyzer
}

/** Production wiring for the analysis routes; `schedule` is supplied by the route (Next.js `after`). */
export function analysisHandlerDeps(schedule: AnalysisHandlerDeps["schedule"]): AnalysisHandlerDeps {
  return { repo: analysisRepository, analyzer: groqAnalyzer, schedule }
}
