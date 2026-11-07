/**
 * componentsV2.test.js — Components V2 compliance guard.
 *
 * Discord's own component reference: once a message is sent with the
 * Components V2 flag (1 << 15), "the content and embeds fields will no longer
 * work". So `{ flags: 32768, content: "..." }` renders as an EMPTY message.
 * Every such send must instead carry a real `components` array.
 *
 * This test fails if that pattern is ever reintroduced.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const files = walk(SRC);

/**
 * Find object literals that carry the V2 flag together with a top-level
 * `content` key and no `components` key. Brace-balanced and string-aware.
 */
function findBrokenSends(source) {
  const offenders = [];
  const V2 = /(?:^|[,{\s])flags\s*:\s*(?:32768|MessageFlags\.IsComponentsV2|\bFLAGS\b)/;
  const CONTENT = /(?:^|[,{\s])content\s*:/;
  const COMPONENTS = /(?:^|[,{\s])components\s*:/;

  const spans = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== "{") continue;
    let depth = 0, j = i, inStr = null, inLine = false, inBlock = false;
    for (; j < source.length; j++) {
      const c = source[j];
      if (inLine) { if (c === "\n") inLine = false; continue; }
      if (inBlock) { if (c === "*" && source[j - 1] === "/") inBlock = false; continue; }
      if (inStr) { if (c === inStr && source[j - 1] !== "\\") inStr = null; continue; }
      if (c === "/" && source[j + 1] === "/") { inLine = true; continue; }
      if (c === "/" && source[j + 1] === "*") { inBlock = true; continue; }
      if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { spans.push([i, j + 1]); break; } }
    }
  }

  for (const [s, e] of spans) {
    const chunk = source.slice(s, e);
    if (!V2.test(chunk)) continue;
    if (COMPONENTS.test(chunk)) continue;
    if (!CONTENT.test(chunk)) continue;
    // Ignore the explanatory comment inside builders.js.
    if (chunk.includes("*")) continue;
    offenders.push(chunk.replace(/\s+/g, " ").slice(0, 90));
  }
  return offenders;
}

test("no message sends the V2 flag with a dropped content field", () => {
  const offenders = [];
  for (const file of files) {
    if (file.endsWith("builders.js")) continue;
    for (const o of findBrokenSends(fs.readFileSync(file, "utf8"))) {
      offenders.push(`${path.relative(ROOT, file)}: ${o}`);
    }
  }
  assert.deepEqual(offenders, [], `These sends would render empty:\n${offenders.join("\n")}`);
});

test("buildText is imported wherever it is used", () => {
  const offenders = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (file.endsWith("builders.js")) continue;
    if (!/\bbuildText\s*\(/.test(src)) continue;
    if (!/import\s*\{[^}]*\bbuildText\b[^}]*\}\s*from/.test(src)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], `Missing buildText import in:\n${offenders.join("\n")}`);
});

test("the guard scans real files", () => {
  assert.ok(files.length > 20, `expected many source files, got ${files.length}`);
});