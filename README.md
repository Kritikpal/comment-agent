# Product Feedback Intelligence — Dashboard

Next.js 16 + TypeScript + shadcn/ui (Base UI) + Recharts. Implements the dashboard for the
**Prototype API & LLM Schemas (LOCKED v1.0)** contract.

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # analytics/validation checks (node --test)
```

## Data

Mock only. `src/lib/mock.ts` holds 32 sample classified comments and builds a full v1.0
`AnalyzeResponse` with the same deterministic aggregation the backend does
(`src/lib/analytics.ts`). The form validates input against the v1.0 rules and caps results at the
sample pool, so a 100-comment request shows the "N of 100 classified" notice.

To go live, replace `mockAnalyze` in `src/components/dashboard/dashboard.tsx` with a `fetch` to
`POST /api/v1/videos/analyze`.

## Contract notes

- **v1.1 agreed, not yet implemented:** [`docs/api-contract-v1.1.md`](docs/api-contract-v1.1.md).
  The UI and mock still follow v1.0 (optional `text`, no `total_fetched` or `ai_summary_comment_ids`).
- Tone counts are derived from `results` because v1.0 `analytics` has no tone block.
- The tone list follows the locked enum (the Notion mockup's "Suggestive/Other" tones are not in it).
