import { recontextStories } from "../src/lib/story-ingest";

console.log(JSON.stringify(await recontextStories()));
process.exit(0);
