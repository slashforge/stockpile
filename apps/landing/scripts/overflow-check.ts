// Dev helper: list elements wider than the viewport using headless Chrome + CDP.
// Usage: bun scripts/overflow-check.ts [url] [viewportWidth]
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9333;
const url = process.argv[2] ?? 'http://localhost:4321/';
const width = Number(process.argv[3] ?? 390);

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    `--window-size=${width},900`,
    '--user-data-dir=/tmp/landing-overflow-profile',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

await new Promise((r) => setTimeout(r, 1500));
const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as {
  webSocketDebuggerUrl: string;
  type: string;
}[];
const page = targets.find((t) => t.type === 'page')!;
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map<number, (v: unknown) => void>();
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg.result);
};
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<any>((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
await new Promise((r) => (ws.onopen = r));
await send('Page.enable');
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 2500));
const res = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        out.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,80), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
      }
    }
    return { vw, sw: document.documentElement.scrollWidth, out: out.slice(0, 40) };
  })()`,
});
console.log(JSON.stringify(res.result.value, null, 1));
ws.close();
chrome.kill();
