/**
 * audit-registry.mjs — Phase 2 registry audit (final).
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "commands");
const entries = (await readdir(dir)).filter((f) => f.endsWith(".js") && f !== "index.js");

const results = [];
const nameToFiles = new Map();

for (const file of entries) {
  const full = path.join(dir, file);
  const src = readFileSync(full, "utf8");
  let mod;
  try {
    mod = await import(pathToFileURL(full).href);
  } catch (e) {
    results.push({ file, error: `IMPORT FAILED: ${e.message}` });
    continue;
  }
  const hasData = !!mod.data;
  const hasExec = typeof mod.execute === "function";
  if (!hasData || !hasExec) {
    results.push({ file, registered: false, reason: `exports data=${hasData} execute=${hasExec}` });
    continue;
  }
  const name = mod.data.name;
  const mismatch = name !== file.replace(/\.js$/, "");
  if (mismatch) {
    const bucket = nameToFiles.get(name) || [];
    bucket.push(file);
    nameToFiles.set(name, bucket);
  }

  let subs = [];
  try {
    const json = mod.data.toJSON();
    if (json.options) subs = json.options.filter((o) => o.type === 1).map((o) => o.name);
  } catch (e) {
    results.push({ file, name, error: `SCHEMA INVALID: ${e.message}` });
    continue;
  }

  // Scan which subs are explicitly handled
  const handled = new Set();
  for (const m of src.matchAll(/[=!]=\s*['"]([a-z0-9_-]+)['"]/g)) handled.add(m[1]);
  for (const m of src.matchAll(/\bcase\s+['"]([a-z0-9_-]+)['"]/g)) handled.add(m[1]);

  // Also include any string literals that appear as sub values anywhere in the file
  const allLiteralRefs = new Set([...src.matchAll(/['"`]([a-z0-9_-]+)['"`]/g)].map(m => m[1]));
  const unhandled = subs.filter((s) => !allLiteralRefs.has(s) && !/\bdefault\s*:/.test(src));

  // Option collision check inside subcommand options
  let optCollisions = null;
  try {
    const json = mod.data.toJSON();
    for (const o of json.options || []) {
      if (!o.options) continue;
      const seen = new Set();
      for (const opt of o.options) {
        if (seen.has(opt.name)) (optCollisions ??= []).push(`${o.name}:${opt.name}`);
        seen.add(opt.name);
      }
    }
  } catch {}

  results.push({ file, name, mismatch, subcommands: subs, unhandledSubs: unhandled, optionCollisions: optCollisions });
}

let dupes = 0;
for (const [n, files] of nameToFiles) {
  if (files.length > 1) { console.log(`DUPLICATE NAME "${n}": ${files.join(", ")}`); dupes++; }
}

console.log(`\n=== COMMAND REGISTRY AUDIT: ${results.length} files ===`);
for (const r of results) {
  if (r.error) { console.log(`✗ ${r.file}: ${r.error}`); continue; }
  if (r.registered === false) { console.log(`- ${r.file}: NOT A COMMAND (${r.reason})`); continue; }
  const flags = [];
  if (r.mismatch) flags.push(`NAME_MISMATCH(file=${r.file},data.name=${r.name})`);
  if (r.unhandledSubs?.length) flags.push(`UNHANDLED=[${r.unhandledSubs.join(",")}]`);
  if (r.optionCollisions?.length) flags.push(`OPT_COLLISIONS=[${r.optionCollisions.join(",")}]`);
  console.log(`✓ ${r.name.padEnd(16)} subs=[${(r.subcommands || []).join(",")}] ${flags.join(" | ")}`);
}

const broken = results.filter((r) => r.unhandledSubs?.length || r.mismatch || r.optionCollisions?.length);
console.log(`\nBroken commands (${broken.length}):`);
for (const r of broken) {
  const flags = [];
  if (r.mismatch) flags.push(`NAME_MISMATCH(file=${r.file},data.name=${r.name})`);
  if (r.unhandledSubs?.length) flags.push(`UNHANDLED=[${r.unhandledSubs.join(",")}]`);
  if (r.optionCollisions?.length) flags.push(`OPT_COLLISIONS=[${r.optionCollisions.join(",")}]`);
  console.log(`  ${r.file}: ${flags.join(" | ")}`);
}
console.log(`\nDuplicate names: ${dupes}`);
console.log(`Registered commands: ${results.filter((r) => r.name && !r.error).length}`);
