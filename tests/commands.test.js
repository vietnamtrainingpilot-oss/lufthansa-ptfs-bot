/**
 * commands.test.js — Test command loading
 */
import test from "node:test";
import assert from "node:assert/strict";
import readdir from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = path.resolve(__dirname, "..", "src", "commands");

test("the command registry loads every command file", async () => {
  const entries = await readdir.readdir(COMMANDS_DIR);
  const files = entries.filter((f) => f.endsWith(".js") && f !== "index.js");

  assert.ok(files.length > 0, "At least one command file must exist");

  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(COMMANDS_DIR, file)).href);
    assert.ok(mod.data, `${file} must export 'data'`);
    assert.ok(typeof mod.execute === "function", `${file} must export 'execute' function`);
  }
});