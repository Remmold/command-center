# 04: @-mentions and attachments like the extension

**What to build:** the @ menu finds files and folders with ripgrep, honouring .gitignore, ranks them fuzzily, quotes paths with spaces and supports `@terminal:`. Attachments accept PDF and text files as well as images, with the extension's limits. Evidence is in `docs/research/vscode-extension-input.md` sections 2 and 3.

**Blocked by:** 01

**Status:** resolved

- [x] File/folder listing via ripgrep (`rg --files`, respecting .gitignore; folders derived), cached per workspace and refreshed on change; fall back to the current lister if rg is missing (check where the extension gets rg — the CLI may bundle it)
- [x] Fuzzy ranking like the extension (per research doc), folders included, paths with spaces quoted on insert
- [x] `@terminal:` mentions per the extension (what it inserts/sends — per research doc; if it depends on VS Code terminals, map to the app's shells and log the decision)
- [x] Attachments: paste, drag-drop and the attach button accept images, PDF and text files as the extension does (content block types and size limits per research doc); the 50,000-character prompt cap with the extension's message
- [x] Tests: pure ranker, quoting, attachment validation; smoke scenario: @ menu lists a gitignored file? (no) and a folder (yes)
