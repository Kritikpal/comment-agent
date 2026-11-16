/** Bump when the prompt or schema changes: every comment is then reclassified on its next run. */
export const PROMPT_VERSION = "classify-v1"
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b"

export function groqModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL
}

/** Prompt + model. Classifications made by any other version are treated as not analyzed. */
export function analyzerVersion(): string {
  return `${PROMPT_VERSION}/${groqModel()}`
}
