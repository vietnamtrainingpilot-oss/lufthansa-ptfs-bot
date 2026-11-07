/**
 * lint.js — Syntax-checks every JavaScript file in the project.
 *
 * Written as a script rather than a shell one-liner because `node --check src/*.js`
 * relies on the shell expanding the glob, which npm does not do on Windows.
 */

import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["src", "scripts", "tests"];

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [];
for (const d of DIRS) files.push(...(await walk(path.join(ROOT, d))));

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed++;
    console.error(`SYNTAX ERROR: ${path.relative(ROOT, file)}`);
    console.error(result.stderr);
  }
}

console.log(`Checked ${files.length} file(s); ${failed} with errors.`);
process.exit(failed === 0 ? 0 : 1);