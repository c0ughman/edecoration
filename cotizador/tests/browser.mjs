/* Real-browser checks: serves the site locally, opens the shipped
   cotizador/index.html in headless Chrome, runs browser-battery.js inside the page and prints its results.
   Unlike verify.js (a stub DOM), this sees the real CSS -- whether a field is
   actually visible -- and the real html2canvas/jsPDF export.

       node cotizador/tests/browser.mjs            (needs Google Chrome)

   Exit code 1 if any check fails. The PDF check needs internet for the CDN
   libraries; offline it reports itself skipped. */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/* Served over http from the site root, as Netlify serves it: opened as a
   file:// page, Chrome treats the logo as cross-origin and html2canvas can no
   longer export the canvas, which is not how anyone uses the tool. */
const root = join(here, "..", "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                ".png": "image/png", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(req.url.split("?")[0])));
  if (!path.startsWith(root) || !existsSync(path)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const page = `http://127.0.0.1:${server.address().port}/cotizador/index.html`;
const battery = readFileSync(join(here, "browser-battery.js"), "utf8");
const CHROME = process.env.CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "cotizador-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${port}`, "--window-size=1400,1400",
  `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, id = 0, failed = true;
const pending = new Map();
try {
  let targets;
  for (let k = 0; k < 75 && !targets; k++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); }
    catch { await sleep(200); }
  }
  ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  };
  const send = (method, params = {}) => new Promise(r => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async expr =>
    (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result?.result?.value;

  await send("Page.enable");
  await send("Page.navigate", { url: page });
  for (let k = 0; k < 100 && (await evaluate("document.readyState")) !== "complete"; k++) await sleep(100);
  await evaluate(battery);
  let out = "";
  for (let k = 0; k < 240 && !out; k++) {
    await sleep(500);
    out = (await evaluate("document.getElementById('battery')?.textContent")) || "";
  }
  if (!out) throw new Error("battery did not finish within 120s");
  const lines = out.split("\n").filter(l => /^(PASS|FAIL) /.test(l));
  lines.forEach(l => console.log(l));
  const bad = lines.filter(l => l.startsWith("FAIL")).length;
  console.log(`${lines.length - bad}/${lines.length} passed${bad ? `, ${bad} FAILED` : ""}`);
  failed = bad > 0;
} catch (e) {
  console.error(e.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill("SIGKILL");
  server.close();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(failed ? 1 : 0);
}
