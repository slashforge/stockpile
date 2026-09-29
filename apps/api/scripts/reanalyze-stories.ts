import { parseArgs } from "node:util";
import { secret } from "../src/lib/config";
import { reanalyzeStories } from "../src/lib/story-ingest";

const { values } = parseArgs({ args: Bun.argv.slice(2), options: {
  apply: { type: "boolean", default: false }, force: { type: "boolean", default: false },
  limit: { type: "string", default: "20" }, id: { type: "string" },
} });
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("--limit must be an integer from 1 to 200");
if (values.apply && !secret("OpenaiApiKey")) throw new Error("OpenaiApiKey is required; no model fallback is used");
console.log(JSON.stringify(await reanalyzeStories({ apply: values.apply, force: values.force, limit, id: values.id }), null, 2));
