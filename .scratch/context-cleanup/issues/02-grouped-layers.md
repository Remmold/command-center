# 02: Layers grouped by kind, with a layer share bar

**What to build:** inside each layer of Context (Account, Repo, Local) items are grouped by kind, each group with a small icon, a count and its token sum, foldable. A slim bar under the start total shows each layer's share. Badges become quieter (spec: `.scratch/context-cleanup/spec.md`).

Rules (from the spec, word for word):
- **Kind grouping (shared, pure).** A function takes one layer's items and returns ordered groups: `{ kind group, items, count, tokens }`. Group order and membership:
  - CLAUDE.md: `claude-md`, `subfolder-claude-md` (imports stay children of their CLAUDE.md, not a group of their own)
  - Memory: `memory-index`, `memory-file`
  - Skills: `skill` · Agents: `agent` · Commands: `command` · MCP servers: `mcp-server` · Plugins: `plugin`
  - Settings & hooks: `settings`, `hook`
  - Empty groups are dropped. A group's tokens is the sum of its items' counted tokens including imports; null when nothing in it counts.
  - The "Loads when Claude works there" section for subfolder CLAUDE.md files stays as today.
- **Layer share bar:** account, repo and local start tokens as a share of the start total, one segment each, labelled in its tooltip. Hidden when the start total is 0.
- **Kind groups fold** with the existing collapsible section; open by default except Skills, Agents and Commands when they hold more than 8 items. Fold state is not saved.
- Badges (shared with Personal, read-only, tools not counted, not found) quieter than today.

**Blocked by:** 01 (both touch the Context view and its UI scenario; run in order)

**Status:** resolved

- [x] Unit tests (seam 2) in the shared context tests: order, empty kinds dropped, sums including imports, null when nothing counts.
- [x] Each layer renders its groups with icon, count and token sum; imports stay nested; folding works; the more-than-8 rule applies.
- [x] Share bar shows under the start total, hidden at 0.
- [x] The Context UI scenario still passes (adjust locators only if group headings change accessible names).
- [x] Quick tier green.
