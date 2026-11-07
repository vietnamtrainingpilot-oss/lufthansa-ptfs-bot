# PC + Browser Control — Installed

**Date:** 2026-10-11
**For:** OpenCode (`~/.config/opencode/opencode.json`)

## Status: DONE — restart OpenCode to load

Three new MCP servers, all globally installed and **verified end-to-end** by spawning them through a real MCP client and listing tools.

| Server | Package | Version | Tools |
|---|---|---|---|
| `playwright` | `@playwright/mcp` | 0.0.83 | 25 |
| `computer-use` | `@zavora-ai/computer-use-mcp` | 7.6.0 | 35 |
| `uia-mcp` | `uia-mcp` | 1.0.2 | 18 |

**78 new tools.** Config verified by reading `opencode.json` and launching each server using the exact command array OpenCode spawns.

## What each one does

### `playwright` — browser tabs and web work
Microsoft-official. Drives Chrome/Edge/Firefox via the accessibility tree (no vision model needed).

- `browser_tabs` — list, create, close, select tabs
- `browser_navigate`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`
- `browser_snapshot` — accessibility tree (cheaper and more reliable than screenshots)
- `browser_evaluate` — run JS in the page
- `browser_network_requests`, `browser_console_messages`
- `browser_take_screenshot`
- `browser_run_code_unsafe` — arbitrary Playwright code (RCE-equivalent, by design)

**Persistent profile by default** — logins and cookies survive between sessions, stored at:
```
%USERPROFILE%\AppData\Local\ms-playwright\mcp-{channel}-{workspace-hash}
```
Delete that directory to sign out of everything.

### `computer-use` — any Windows application
Rust native module, cross-platform, 35 tools. Screenshots, mouse, keyboard, clipboard, window and process management, app discovery.

- `screenshot`, `zoom`, `click`, `type`, `key`
- `doctor` — run this first if something misbehaves
- `policy_status` — check what the server currently permits

### `uia-mcp` — Windows controls by name, not pixels
UI Automation. Finds and clicks controls by accessibility name/ID/class. **More reliable than pixel-clicking**, because it targets the actual control rather than guessing coordinates.

- `uia_snapshot`, `uia_focused`, `uia_descendants`, `uia_find_name`
- `uia_action` — invoke, focus, toggle, expand, scroll
- `uia_table` — read a grid/table as a cell matrix

Requires an interactive desktop session. Bundles its own .NET runtime (no SDK needed).

## chrome-devtools — kept, and why

You asked me to check whether Playwright makes it redundant. **It does not.** Playwright has no equivalent for:

- **Performance traces** — `performance_start_trace` / `performance_stop_trace` / `performance_analyze_insight` (Core Web Vitals, LCP/INP/CLS)
- **Lighthouse audits** — `lighthouse_audit` (a11y, SEO, best practices)
- **Heap snapshots** — 14 memory-debugging tools for leak analysis (`take_heapsnapshot`, `get_heapsnapshot_retainers`, etc.)
- **CSS cascade inspection** — `get_css_styles` shows matched rules with precedence and source lines
- **Chrome extension + PWA management** — install/launch/uninstall PWAs, manage extensions
- **Screencast** — record the page as video

Playwright is better at *driving* a browser. Chrome DevTools is better at *diagnosing* one. Both earn their place.

**Fixed:** it was pointing at `CHROME_PORT=9222`, where nothing was listening. It now launches its own isolated Chrome via `--isolated` and no longer needs the port.

## Overlap — which to reach for

| Task | Use |
|---|---|
| Fill a form, scrape a page, use tabs | `playwright` |
| Diagnose slow page, check Core Web Vitals | `chrome-devtools` |
| Find a memory leak | `chrome-devtools` |
| Click a native Windows dialog | `uia-mcp` |
| Click anything in a non-accessible app (canvas, game, remote desktop) | `computer-use` |

## Security — read this once

These grant real reach over your machine, and that is what you asked for. Being straight about the implications:

1. **`computer-use` and `uia-mcp` can click and type into anything** — including windows logged into your accounts. No confirmation step.
2. **`playwright`'s persistent profile stores cookies and logins on disk.** Delete that folder to revoke.
3. **`browser_run_code_unsafe` executes arbitrary code** in the Playwright server process. Full RCE equivalent.
4. **`computer-use` can run and kill processes.** Shutting down or force-closing apps is within its reach.

Your session is a live `Console` session running as `Admin`, so all of this is available without elevation prompts.

If you want a guardrail later, the cheapest one is running `computer-use` with `COMPUTER_USE_PROFILE=core` instead of the default profile — fewer tools, smaller blast radius.

## Rollback

Backup of `opencode.json` taken before editing:
```
C:\Users\Admin\AppData\Local\Temp\opencode\opencode.json.bak-20261011-150023
```

To uninstall the servers:
```powershell
npm uninstall -g @playwright/mcp @zavora-ai/computer-use-mcp uia-mcp
```
Then remove the `playwright`, `computer-use`, and `uia-mcp` blocks from the `mcp` object in `opencode.json`.