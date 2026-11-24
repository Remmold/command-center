# 03: MCP servers, settings, hooks and permissions in Context

**What to build:** the context reader and the layers pane gain MCP servers and the settings layers (spec: `.scratch/context-view/spec.md`).

Rules (from the spec, word for word):
- **MCP servers:** from the account's `.claude.json` (top level and the project entry for the workspace path) and the repo's `.mcp.json`. Name and source only. Tools are never counted and servers are never started. Each is marked "tools not counted".
- The settings.json layers (account, repo, local) listed with their hooks and permission allow rules summarised. The repo layer is `.claude/settings.json`; the local layer is `.claude/settings.local.json`.
- Hooks show what runs (event and command). Hook scripts are items with a path, so they can open as text later; they are never run.

- Decided by the conductor after ticket 02 (2026-11-24): a skill whose frontmatter has `disable-model-invocation: true` is only offered to you as a slash command, so Claude never sees its description. It is listed but not counted (tokens null) and shows "slash command only".

**Blocked by:** 01

**Status:** resolved

- [x] MCP servers are listed per source with "tools not counted", and none is started.
- [x] Settings items per layer, with hooks and allow rules summarised.
- [x] Unit tests (seam 1): a `.claude.json` with top-level servers and a project entry for the workspace path (plus one for another path that must not show), a repo `.mcp.json`, and account, repo and local settings with hooks and allow rules.
- [x] Quick tier green.
