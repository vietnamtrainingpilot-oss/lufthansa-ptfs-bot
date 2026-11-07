# Freebuff Setup — Complete

**Date:** 2026-10-11
**Goal:** Port every plugin and skill from the OpenCode install to Freebuff.

## Status: DONE — restart Freebuff to load

Everything below is already installed. Freebuff reads these at startup, so **quit and relaunch it** to pick up the new files.

## What was installed

| Component | Count | Location |
|---|---|---|
| Skills | 168 | `~/.agents/skills/` |
| MCP servers | 5 | `~/.agents/mcp.json` |
| Global preferences | 1 file | `~/.knowledge.md` |

### Skills

All 168 skills validated against Freebuff's rules — **0 invalid names, 0 frontmatter/name mismatches, 0 overlong descriptions.** Every directory contains a valid `SKILL.md`.

Four sources were merged:

| Source | Skills | Notes |
|---|---|---|
| `superpowers` (git plugin) | 14 | brainstorming, TDD, systematic-debugging, writing-plans, etc. |
| `~/.config/opencode/skills` | 124 | incl. ~50 bitwize-music album skills |
| `~/.opencode/skills/obsidian-skills/skills` | 21 | |
| `~/.agents/skills` (pre-existing) | 10 | already there, left untouched |

**One collision resolved:** `subagent-driven-development` existed in both `superpowers` and `config`. The existing copy was kept — identical skill, so no content was lost.

### MCP servers

`cloudflare` was already configured and is **preserved as-is**. Four added, ported from OpenCode's `["cmd","/c",...]` array form to Freebuff's `{command, args}` object form:

- `robloxstudio`
- `weppy-roblox`
- `chrome-devtools` (with `CHROME_PORT=9222`)
- `bitwize-music-mcp` (launcher path verified to exist)

### Plugins — no direct equivalent

Freebuff (a Codebuff fork) has **no plugin system**. OpenCode's three plugins were handled as:

| OpenCode plugin | How it was ported |
|---|---|
| `superpowers` | It ships 14 skills — all copied. Loads natively. |
| `ponytail` | Runtime system-prompt injection → ported verbatim into `~/.knowledge.md` |
| `claude-mem` | MCP-backed memory → noted in `~/.knowledge.md`; MCP server reachable if configured |

## Verify it loaded

Paste this into Freebuff:

```
List your available skills. Then tell me: how many skills do you see?
I expect 168. Separately, confirm whether these MCP servers are
connected: cloudflare, robloxstudio, weppy-roblox, chrome-devtools,
bitwize-music-mcp.
```

## If skills don't appear

1. **Fully quit Freebuff** — not just the session window. It reads config at startup.
2. Confirm path: `~/.agents/skills/` (that is `C:\Users\Admin\.agents\skills`).
3. Check one manually: `C:\Users\Admin\.agents\skills\brainstorming\SKILL.md` should exist.
4. Skills also load from `~/.claude/skills/`, `./.agents/skills/`, `./.claude/skills/`. Project-level paths override global ones with the same name — if a skill is shadowed, a project copy is winning.

## If an MCP server fails to connect

All four are stdio servers launched via `cmd /c`, required on Windows. Test one directly:

```powershell
cmd /c npx -y @chrrxs/robloxstudio-mcp@latest --help
```

For `chrome-devtools`, Chrome must be listening on port 9222.

## Rollback

Full pre-change backup of `~/.agents` (267 files):

```
C:\Users\Admin\AppData\Local\Temp\opencode\agents-backup-20261011-145339
```

Restore by copying that `.agents` folder back over `C:\Users\Admin\.agents\`, and delete `C:\Users\Admin\.knowledge.md`.

## Source notes

- Skills docs: https://codebuff.com/docs/tips/skills
- MCP docs: https://codebuff.com/docs/tips/mcp-servers
- Knowledge files: https://codebuff.com/docs/tips/knowledge-files