# 05: Session history like the extension

**What to build:** sessions get the extension's history behaviour: titles generated the way the extension gets them, renames that reach the CLI, a status dot per entry, and search across past sessions. Evidence is in `docs/research/vscode-extension-input.md` section 5.

**Blocked by:** 01

**Status:** resolved

- [x] Titles: use the CLI/extension title mechanism (per research doc — e.g. a summary event or control request) instead of only the first prompt; keep a manual rename winning
- [x] Rename tells the CLI the way the extension does (per research doc), so the title shows in VS Code's history too
- [x] Past sessions (Work list menu → Past sessions…) show the extension's entry info (title, time, status dot) and search
- [x] Tests: pure title selection (manual > CLI title > first prompt); smoke scenario on the fake CLI
