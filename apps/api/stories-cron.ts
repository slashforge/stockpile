import { ingestStories, reanalyzeStories } from "./src/lib/story-ingest";

export default {
  async scheduled() {
    // Store publisher excerpts first; only the bounded retry pass can spend on AI.
    try {
      console.log("story ingestion", JSON.stringify(await ingestStories({ ai: false, pageImages: false })));
    } catch {
      console.error("story ingestion failed; continuing pending analysis");
    }
    const result = await reanalyzeStories({ apply: true, limit: 5, scheduled: true });
    console.log("story analysis", JSON.stringify(result));
  },
};
