# 06: Permissions editor

**What to build:** the Permissions category gets a purpose-built editor: Allow, Ask and Deny as three lists of rules, a rule builder, and the related permission settings in one place. Spec: `.scratch/claude-settings/spec.md` (user stories 25–28).

**Blocked by:** 05

**Status:** resolved

- [x] Allow, Ask and Deny show as three lists for the edited layer, with the effective (combined) rules visible for the workspace.
- [x] Add a rule by picking a tool (Bash, PowerShell, Read, Edit, Write, WebFetch, an MCP server, Agent, …) and typing a pattern, with a plain sentence of what it does ("Allow Bash commands starting with git status").
- [x] Move a rule between Allow, Ask and Deny, and remove it.
- [x] The editor includes the default permission mode, extra folders Claude may use, and the block-outside-folder switches.
- [x] An Allow rule of bare `Bash`, `PowerShell` or `Bash(*)` shows the risk warning.
- [x] Vitest: rule text to plain sentence for each tool kind, and a built rule round-trips to its text.
