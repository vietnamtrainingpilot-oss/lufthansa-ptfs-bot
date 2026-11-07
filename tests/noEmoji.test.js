/**
 * noEmoji.test.js — Branding guard.
 * The specification requires all content to be emoji-free until the owner adds
 * any manually. This scans the shipped source, tests, scripts, docs and website
 * for emoji code points and fails if any are present.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");
const SRC = path.join(ROOT, "src");
const TESTS = path.join(ROOT, "tests");
const SCRIPTS = path.join(ROOT, "scripts");
const WEBSITE = path.join(ROOT, "website");
const DOCS = [path.join(ROOT, "README.md"), path.join(ROOT, "LOYALTY_SYSTEM.md"), path.join(ROOT, "CHECKLIST.md"), path.join(ROOT, "WEBSITE_DEPLOYMENT.md")];

// Genuine emoji ranges only. Arrows (U+2190-U+21FF) and other symbols used as
// typographic connectors in prose are deliberately excluded — they are text,
// not emoji.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;

/**
 * Escaped emoji (for example "\u2705") render on Discord exactly like a literal
 * one, but a raw-source scan never sees them. Decode the common escapes first
 * so a written escape cannot slip past the guard.
 */
const ESCAPED = /\\u\{?([0-9a-fA-F]{4,6})\}?/g;

function decodeEscapes(line) {
  return line.replace(ESCAPED, (match, hex) => {
    const code = parseInt(hex, 16);
    // Only decode into the emoji/symbol ranges; leave other escapes alone.
    if (code >= 0x2600 && code <= 0x27bf) return String.fromCodePoint(code);
    if (code >= 0x2b00 && code <= 0x2bff) return String.fromCodePoint(code);
    if (code >= 0x1f000 && code <= 0x1faff) return String.fromCodePoint(code);
    return match;
  });
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|html|css|md)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [...walk(SRC), ...walk(TESTS), ...walk(SCRIPTS), ...walk(WEBSITE), ...DOCS.filter((f) => fs.existsSync(f))];

// Lines that define an emoji-detection pattern are the guard itself, not a
// violation; decoding their escapes would flag every regex in the codebase.
const isPatternDefinition = (line) =>
  // A character-class regex literal like /[\u{1F300}-...]/ is a pattern
  // definition, not rendered content.
  /\/\s*\[[^\]]*\\u\{?[0-9a-fA-F]/.test(line) ||
  /(^|[^\w])(const|let|var)\s+\w*(EMOJI|RANGE)\w*\s*=/.test(line) ||
  /return line\.replace\(ESCAPED/.test(line) ||
  // Prose describing what this guard looks for, e.g. a comment that mentions an
  // escaped emoji as an example. Deliberately narrow so ordinary comments
  // elsewhere are still scanned normally.
  (/^\s*(\*|\/\/|#)\s/.test(line) && /\bexample\b/i.test(line));

test("no emoji appear anywhere in shipped source, tests, scripts, docs or website", () => {
  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (isPatternDefinition(lines[i])) continue;
      // Check both the literal line and its decoded escapes.
      if (EMOJI.test(lines[i]) || EMOJI.test(decodeEscapes(lines[i]))) {
        offenders.push(`${path.relative(ROOT, file)}:${i + 1}: ${lines[i].trim().slice(0, 80)}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], `Emoji found in:\n${offenders.join("\n")}`);
});

test("the scan actually covers files", () => {
  assert.ok(files.length > 20, `expected to scan many files, got ${files.length}`);
});