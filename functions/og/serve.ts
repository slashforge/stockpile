// Local stand-in for the OG Lambda (infra/og.ts runs this as a DevCommand on non-deployed stages).
// Try: http://localhost:4500/bag/ai-infrastructure.png  or  http://localhost:4500/asset/NVDAx.png
import { envFromProcess, renderRoute } from "./handler";

const env = envFromProcess();
const server = Bun.serve({
  port: Number(process.env.PORT ?? 4500),
  async fetch(request) {
    const { pathname } = new URL(request.url);
    try {
      const result = await renderRoute(pathname, env);
      return new Response(result.body, { status: result.status, headers: result.headers });
    } catch (error) {
      console.error("[og] render failed", pathname, error);
      return new Response("Render failed", { status: 500 });
    }
  },
});

console.log(`OG cards at http://localhost:${server.port} (API ${env.apiUrl})`);
console.log(`  http://localhost:${server.port}/bag/ai-infrastructure.png`);
console.log(`  http://localhost:${server.port}/asset/NVDAx.png`);
