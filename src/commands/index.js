/**
 * commands/index.js — Central command registry.
 *
 * Reads every .js file in this folder (except this one) and imports the ones
 * that export both `data` (the slash command definition) and `execute` (the
 * handler).
 *
 * Uses readdir rather than fs/promises.glob on purpose:
 *   - glob() returns an async iterator, not an array, so a plain `for..of`
 *     over it throws "not iterable" on current Node versions.
 *   - glob() returns Windows paths, so building `file://${file}` by hand
 *     produced an invalid URL on the platform this project actually runs on.
 * pathToFileURL() handles both correctly.
 */

import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const entries = await readdir(__dirname);
const commands = {};

for (const entry of entries) {
  if (!entry.endsWith(".js")) continue;
  if (entry === "index.js") continue;

  const mod = await import(pathToFileURL(path.join(__dirname, entry)).href);

  // A command module must expose both halves; anything else is not a command.
  if (mod.data && typeof mod.execute === "function") {
    commands[entry.slice(0, -3)] = mod;
  }
}

export default commands;