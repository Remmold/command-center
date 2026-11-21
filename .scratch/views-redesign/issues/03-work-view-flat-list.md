# 03: Work view with one flat session list

**What to build:** the Work view becomes one left list of every session across all workspaces, grouped by state, beside the open chat. Sessions name themselves from their first prompt. Workspace tabs, the sidebar tree and per-workspace chat tabs go away. This is spec seam 1, the session list model.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Session list model (pure): takes hosted sessions (from the existing per-workspace session state), their statuses, observed sessions, workspaces and repo identities. Returns grouped, ordered rows: groups Needs you → Running → Idle → In VS Code, most recent activity first within each group, filtered by search over title, repo name and worktree tag. Waiting rows inside Needs you keep the queue order (longest wait first).
- [ ] Session titles: each hosted session stores a `title`. It is set from its first user prompt (first line, whitespace collapsed, cut to 60 characters with "…") unless renamed, and a rename is kept. Before any prompt the title is "New session". Persisted with the session. Double-click a row to rename.
- [ ] Each row shows repo icon, worktree tag, title and status dot. A search box sits above the list.
- [ ] Layout: a left list (resizable, default 300 px) and a chat area holding the open chat. Clicking a row opens it. Ctrl+J still jumps to the next waiting session.
- [ ] The chat header shows repo icon, worktree tag, title, account profile and status
- [ ] Observed VS Code sessions open read-only in the same chat area, marked "in VS Code"
- [ ] Ctrl+B (IDE panels) and Ctrl+\` (shell) act on the open session's workspace, hidden by default
- [ ] Workspace tabs (ProjectTabs), the sidebar tree and per-workspace chat tabs (CenterTabs) are removed from the UI and deleted if unused; the per-workspace session data they read stays and feeds the list model. Alt+1..9 now selects the 1st–9th row of the list.
- [ ] Tests for the model: grouping and group order; ordering within groups; Needs you keeping queue order; search over title, repo and worktree tag; observed sessions only in In VS Code; closed sessions absent; title rules (first line, 60-character cut, "New session" before any prompt, rename kept)
