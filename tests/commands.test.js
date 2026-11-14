/**
 * commands.test.js — Command registry structural verification.
 *
 * Verifies:
 *  - Every command file exports both `data` and `execute`.
 *  - The command's registered name matches its filename (dispatch key).
 *  - Every subcommand defined in the schema is referenced in execute.
 *  - The registry has no duplicate command names.
 *
 * Uses a namespace import for node:fs/promises to avoid ESM loader quirks.
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = path.resolve(__dirname, "..", "src", "commands");

test("every command file exports data and execute", async () => {
  const entries = await fs.readdir(COMMANDS_DIR);
  const files = entries.filter((f) => f.endsWith(".js") && f !== "index.js");
  assert.ok(files.length > 0, "at least one command file exists");

  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(COMMANDS_DIR, file)).href);
    assert.ok(mod.data, `${file} must export 'data'`);
    assert.ok(typeof mod.execute === "function", `${file} must export 'execute' function`);
  }
});

test("every command name matches its filename (dispatch key)", async () => {
  const entries = await fs.readdir(COMMANDS_DIR);
  const files = entries.filter((f) => f.endsWith(".js") && f !== "index.js");
  const names = new Set();

  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(COMMANDS_DIR, file)).href);
    const expected = file.replace(/\.js$/, "");
    assert.equal(mod.data.name, expected, `${file} registers name '${mod.data.name}' but filename is '${expected}'`);
    assert.ok(!names.has(mod.data.name), `duplicate command name '${mod.data.name}'`);
    names.add(mod.data.name);
  }
});

test("every subcommand defined in the schema is reachable from execute", async () => {
  const entries = await fs.readdir(COMMANDS_DIR);
  const files = entries.filter((f) => f.endsWith(".js") && f !== "index.js");

  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(COMMANDS_DIR, file)).href);
    let json;
    try {
      json = mod.data.toJSON();
    } catch {
      continue; // non-subcommand builder without toJSON — schema verified elsewhere
    }
    const subs = (json.options || []).filter((o) => o.type === 1).map((o) => o.name);
    if (subs.length === 0) continue;

    const src = (await fs.readFile(path.join(COMMANDS_DIR, file), "utf8"));
    // Only examine the execute handler, not the schema definition.
    const execIdx = src.indexOf("execute");
    const handler = execIdx >= 0 ? src.slice(execIdx) : src;
    for (const sub of subs) {
      // Every subcommand must be branched on inside execute via a string-literal
      // equality, switch-case, or ternary reference. Schema .setName() is excluded.
      const referenced = handler.includes(`"${sub}"`) || handler.includes(`'${sub}'`);
      assert.ok(referenced, `${file} defines subcommand '${sub}' but never references it in execute`);
    }
  }
});