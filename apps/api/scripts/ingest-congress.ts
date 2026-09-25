import { ingestCongress } from "../src/lib/congress";

const result = await ingestCongress();
console.log(JSON.stringify(result));
process.exit(result.errors.length && !result.inserted ? 1 : 0);
