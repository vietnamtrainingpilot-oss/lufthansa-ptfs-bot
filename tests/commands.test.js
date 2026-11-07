/**
 * commands.test.js — Regression guard for slash command registration.
 *
 * Every command's SlashCommandBuilder must serialise successfully. A builder
 * that throws here would abort the whole REST registration call at boot, taking
 * every command offline. This test catches malformed options (missing
 * descriptions, bad choice shapes, duplicate values) before deployment.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const CMD_DIR = path.join(ROOT, "src", "commands");

const commandFiles = fs
  .readdirSync(CMD_DIR)
  .filter((f) => f.endsWith(".js") && f !== "index.js")
  .map((f) => path.join(CMD_DIR, f));

test("the command registry actually loads every command", async () => {
  // The registry previously treated fs/promises.glob() (an async iterator) as
  // an array, so `for (const file of cmdFiles)` threw and src/index.js swallowed
  // it. Zero commands registered and every slash command silently did nothing,
  // while this suite stayed green because it imports command files directly.
  const registry = (await import(pathToFileURL(path.join(CMD_DIR, "index.js")).href)).default;

  const expected = commandFiles.map((f) => path.basename(f, ".js"));
  for (const name of expected) {
    assert.ok(registry[name], `command "${name}" is missing from the registry`);
    assert.ok(registry[name].data, `command "${name}" has no SlashCommandBuilder`);
    assert.equal(typeof registry[name].execute, "function", `command "${name}" has no execute()`);
  }

  assert.ok(
    Object.keys(registry).length > 10,
    `expected the registry to hold every command, got ${Object.keys(registry).length}`
  );
});

test("the registry loads without throwing on this platform", async () => {
  // Guards the Windows path handling: building a file:// URL from a backslash
  // path produced an invalid URL.
  await assert.doesNotReject(() => import(pathToFileURL(path.join(CMD_DIR, "index.js")).href));
});

test("every slash command serialises to a valid Discord payload", async () => {
  assert.ok(commandFiles.length > 0, "expected command files to exist");

  const failures = [];
  const names = [];

  for (const file of commandFiles) {
    const mod = await import(pathToFileURL(file).href);
    if (!mod.data?.toJSON) {
      failures.push(`${path.basename(file)}: no SlashCommandBuilder exported`);
      continue;
    }
    try {
      const json = mod.data.toJSON();
      names.push(json.name);
    } catch (e) {
      failures.push(`${path.basename(file)}: ${e.message}`);
    }
  }

  assert.deepEqual(failures, [], `Invalid command builders:\n${failures.join("\n")}`);
  assert.ok(names.includes("rewards"), "/rewards must exist");
  assert.ok(names.includes("economy"), "/economy must exist");
  assert.ok(names.includes("flight"), "/flight must exist");
  assert.ok(names.includes("ping"), "/ping must exist");
});

/**
 * Deliberate aliases: these files re-export another command's definition, so two
 * files legitimately serialise to the same command name. Discord keeps the last
 * registration, which is harmless because the payloads are identical.
 */
const ALLOWED_ALIASES = {
  "tickets.js": "ticketsetup",
  "ticketsetup.js": "ticketsetup",
  "careers.js": "careersetup",
  "careersetup.js": "careersetup",
};

test("command names are unique apart from declared aliases", async () => {
  const seen = new Map();
  const unexpected = [];

  for (const file of commandFiles) {
    const base = path.basename(file);
    const mod = await import(pathToFileURL(file).href);
    if (!mod.data?.toJSON) continue;
    const name = mod.data.toJSON().name;

    if (seen.has(name)) {
      const allowedFor = ALLOWED_ALIASES[base];
      if (allowedFor !== name) {
        unexpected.push(`${base} duplicates "${name}" (also in ${seen.get(name)})`);
      }
    } else {
      seen.set(name, base);
    }
  }

  assert.deepEqual(unexpected, [], unexpected.join("\n"));
});

test("every option has a description", async () => {
  // discord.js throws on a missing description, but this asserts the intent
  // explicitly so a future refactor cannot regress it silently.
  const walk = (options, path, out) => {
    for (const o of options || []) {
      if (!o.description) out.push(`${path}.${o.name} (missing description)`);
      if (o.options) walk(o.options, `${path}.${o.name}`, out);
    }
  };

  const problems = [];
  for (const file of commandFiles) {
    const mod = await import(pathToFileURL(file).href);
    if (!mod.data?.toJSON) continue;
    const json = mod.data.toJSON();
    walk(json.options, json.name, problems);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});