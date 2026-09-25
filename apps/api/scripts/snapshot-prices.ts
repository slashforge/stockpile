import { snapshotPrices } from "../src/lib/history";

const result = await snapshotPrices();
console.log(JSON.stringify(result));
process.exit(result.written ? 0 : 1);
