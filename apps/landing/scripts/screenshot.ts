// Dev helper: full-page screenshot at an emulated viewport via headless Chrome + CDP.
// Usage: bun scripts/screenshot.ts <url> <width> <height> <outPng> [fullPage=1]
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9334;
const [url = 'http://localhost:4321/', w = '390', h = '844', out = 'shot.png', full = '1'] = process.argv.slice(2);
const width = Number(w);
const height = Number(h);

const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/landing-shot-profile', 'about:blank'],
  { stdio: 'ignore' },
);

await new Promise((r) => setTimeout(r, 1500));
const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { webSocketDebuggerUrl: string; type: string }[];
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
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 700 });
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 3000));
const metrics = await send('Page.getLayoutMetrics');
const fullHeight = Math.ceil(metrics.cssContentSize?.height ?? metrics.contentSize.height);
const clipHeight = full === '1' ? fullHeight : height;
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
  clip: { x: 0, y: 0, width, height: clipHeight, scale: 1 },
});
await Bun.write(out, Buffer.from(shot.data, 'base64'));
console.log(`${out}: ${width}x${clipHeight} (scrollWidth ${metrics.cssContentSize?.width ?? metrics.contentSize.width})`);
ws.close();
chrome.kill();
