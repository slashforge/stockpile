import { backfillStoryImages } from "../src/lib/story-ingest";

console.log(JSON.stringify(await backfillStoryImages()));
process.exit(0);
