import { app, openApiConfig } from "../src/app";

const doc = app.getOpenAPI31Document(openApiConfig);
const outPath = new URL("../../../packages/api-client/openapi.json", import.meta.url);

await Bun.write(outPath, `${JSON.stringify(doc, null, 2)}\n`);

console.log(`OpenAPI spec written to ${outPath.pathname}`);
