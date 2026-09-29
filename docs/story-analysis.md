# Story investment analysis

News ingestion uses OpenAI **GPT-6 Luna**, API model ID `gpt-6-luna`, through the Responses API with strict structured output. The official model page documents that ID and structured-output support: https://developers.openai.com/api/docs/models/gpt-6-luna (verified 2026-09-29). There is no substitute-model fallback. The existing SST-linked `OpenaiApiKey` must have access to that model. No paid provider calls were made to verify account access during implementation.

Each story request supplies the publisher title and at most 700 characters of its feed excerpt, plus each linked bag's thesis and current holdings/weights. This is **not full-article analysis**. The output separates the reported event, possible business mechanism, implications for each bag, uncertainty, next developments to watch, and a verbatim excerpt quotation. The server validates the shape, bag coverage, holding allowlist, evidence substring and numeric grounding. These checks cannot prove every causal inference is correct; analysis remains labelled AI interpretation, not investment advice or a return forecast.

Missing credentials, rejected/insufficient source text, provider errors, refusals, incomplete responses or invalid output produce explicit unavailable analysis. They are not neutral verdicts. Legacy `context` remains for API compatibility but is not used for web/mobile investment judgments. Neutral, mixed and unclear are separate analysis outcomes. Target allocations describe exposure, not a predicted stock move, materiality or guaranteed diversification protection. A changed thesis or allocation makes the client mark the old analysis unavailable until refreshed.

## Automatic ingestion and missing-analysis backfill

Deployed SST stages (`prod`, `dev`, `beta`) run the independent `StoryRefresh` Worker at **:15 and :45 each hour, UTC**. Hourly `PriceSnapshots` remains unchanged at :00. Local stages do not run this cron.

Each run ingests up to five entries from each of eleven approved feeds plus five podcast episodes, storing publisher excerpts without calling the model. Feed requests have 10-second timeouts (podcasts seven seconds), bounded bodies, and no article-page image requests in cron. Feed-provided images are still saved. A separate pass handles at most **five missing-analysis rows**, oldest first, filtering missing/due rows in SQL *before* applying the limit. Successful rows are never automatically reanalyzed. This drains legacy missing analysis instead of repeatedly scanning only the newest successful records.

Retry state is stored inside the existing connections JSONB (no migration). Each row is atomically claimed before analysis, so overlapping cron deliveries cannot both pay for it. Failures preserve the existing summary/analysis and retry after six hours, then 24 hours, up to **three automatic attempts total**. Missing credentials do not consume attempts. Legacy rows whose publisher excerpt is no longer available also stop after three attempts; no summary is substituted as evidence. Explicit manual `--id --apply` can retry exhausted rows after fixing a cause; `--force` is still required for successful rows.

The analysis pass stops starting rows after eight minutes. Each model request has a 60-second abort timeout, an 8,000-output-token cap, and no internal model retry or fallback. The ceiling is five model calls per invocation: nominally 240 calls / 1,920,000 output tokens per day per deployed stage at 48 deliveries (actual billed input/reasoning/output usage varies). This is not an account-level or dollar cap: duplicate deliveries may process different eligible rows, and manual runs have separate limits. Structured run logs include inserted rows, updated analyses, source failures and unavailable reasons. Exhausted rows remain explicitly unavailable rather than blocking later work.

Activation requires deploying this code to the intended stage and making the stage's SST-linked `OpenaiApiKey` available with access to `gpt-6-luna`. No manual routine backfill is needed. The secret is already declared in `infra/secrets.ts` and linked to the new worker through `API_LINKS`; an empty optional placeholder permits ingestion but defers AI with a log message. The installed SST loader initializes `Resource` automatically in Bun scripts; the config accessor was verified with an injected test-only SST link, without extra initialization. The current unwrapped shell has no SST links. Prior shell failures do **not** prove that a stage secret is unset: verify the intended stage's linked resource availability without printing its value, then redeploy if configuration changed. No real stage secret was inspected or set, and no deployment or paid call was made here.

## Existing stories: optional manual backfill

The analysis and source excerpt live inside the existing `stories.connections` JSONB field. No SQL column migration is required; old rows remain readable. Ingestion does not silently rewrite existing analyses.

Run commands in the intended SST stage/environment (select the stage using the repository's usual SST shell workflow). Preview first:

```sh
bun run stories:reanalyze --limit 20
bun run stories:reanalyze --id STORY_ID
```

These are database reads only: no provider/feed calls and no updates. After reviewing the target and approving paid AI calls and database writes:

```sh
bun run stories:reanalyze --id STORY_ID --apply
bun run stories:reanalyze --limit 200 --apply
```

The limit is 1-200 and applies to the newest matching published article/podcast rows with missing analysis (or all matching rows with `--force`). Successful existing analyses are skipped unless `--force` is passed. Use `--id` for a specific older story or `--force --id STORY_ID --apply` after its bag changes. Disclosures are deliberately not reinterpreted as news or buy/sell signals.

For new-format rows, reanalysis uses the saved publisher excerpt. For legacy rows, it refetches only approved publisher feeds/podcast entries and matches the canonical story ID. It **never treats a prior AI summary as original source evidence**. Older articles that have left the feeds remain explicitly unavailable; the command reports their IDs and does not fabricate a replacement. Source-fetch and analysis failures preserve the stored row, including any previous valid analysis. The old `stories:recontext` keyword command now exits with instructions to use this workflow.

No migration, backfill, deployment or live database write was performed as part of implementation. Model availability is documented, but account-specific access and live output quality still require an authorized smoke test.
