/**
 * overflow-check.mjs — Report any element wider than the viewport.
 * Used to catch horizontal-overflow defects that a screenshot can obscure.
 */

const url = process.argv[2] || "http://127.0.0.1:3100/";
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 900);

const { spawn } = await import("node:child_process");
const http = await import("node:http");

const port = 9333;
const chrome = spawn(
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    "--user-data-dir=C:\\Users\\Admin\\AppData\\Local\\Temp\\vjptfs-of-profile",
    "about:blank",
  ],
  { stdio: "ignore" }
);

const getJson = (path) =>
  new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });

try {
  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await getJson("/json/version"); break; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  const targets = await getJson("/json/list");
  const page = targets.find((t) => t.type === "page") || targets[0];

  const { WebSocket } = await import("node:ws").catch(() => ({ WebSocket: globalThis.WebSocket }));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const msgId = ++id;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  });

  await new Promise((r) => ws.addEventListener("open", r));
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
  await send("Page.enable");
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 4000));

  const res = await send("Runtime.evaluate", {
    expression: `(() => {
      const vw = document.documentElement.clientWidth;
      const offenders = [];
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width > vw + 1 || r.right > vw + 1) {
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && el.className.toString().slice(0, 60)) || '',
            id: el.id || '',
            width: Math.round(r.width),
            right: Math.round(r.right),
          });
        }
      }
      return JSON.stringify({
        viewportWidth: vw,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        offenders: offenders.slice(0, 15),
      });
    })()`,
    returnByValue: true,
  });

  const info = JSON.parse(res.result.value);
  console.log(`viewport: ${info.viewportWidth}px  scrollWidth: ${info.scrollWidth}px  bodyScrollWidth: ${info.bodyScrollWidth}px`);
  if (info.offenders.length === 0) {
    console.log("OK: no element exceeds the viewport width");
  } else {
    console.log("OVERFLOW offenders:");
    for (const o of info.offenders) {
      console.log(`  <${o.tag}${o.id ? "#" + o.id : ""}${o.cls ? " class=\"" + o.cls + "\"" : ""}> w=${o.width} right=${o.right}`);
    }
  }
  ws.close();
} catch (e) {
  console.error("check failed:", e.message);
} finally {
  chrome.kill();
}