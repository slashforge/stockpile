import { ingestStories } from "../src/lib/story-ingest";

const result = await ingestStories();
console.log(JSON.stringify(result));
if (result.errors.length) process.exitCode = 1;
