# 02: Memory, skills, agents, commands and plugins in Context

**What to build:** the context reader and the layers pane gain memory, skills, agents, commands and plugins (spec: `.scratch/context-view/spec.md`).

Rules (from the spec, word for word):
- Memory lives in that folder's `projects/<sanitised cwd>/memory`, using the existing sanitising rule for transcript folders. The workspace's memory folder is shown with MEMORY.md counted and its other files listed.
- Skills, agents and commands from the account, from enabled plugins and from the repo, listed with where each comes from (source `account`, `plugin:<name>`, `repo`).
- **Token estimate:** characters ÷ 4, rounded, shown as "~N" or "~N.Nk". Skills and agents count only their frontmatter name and description; the body is not counted.
- **Plugins:** `enabledPlugins` from the settings layers. Their skills, agents and commands are read from the plugin cache and sourced `plugin:<name>`. Enabled plugins are listed per layer.
- The "projects" folder is one of the items the Work account links to Personal, so memory for the same workspace path is shared too, and Context shows that with the same "shared with Personal" label.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The memory folder shows in the account layer, with MEMORY.md counted and the other files listed.
- [ ] Skills, agents and commands are listed with their source; descriptions are counted, bodies are not.
- [ ] Enabled plugins are listed per layer; their skills, agents and commands are sourced `plugin:<name>`.
- [ ] The start totals in the list and the pane include the new counts.
- [ ] Unit tests (seam 1) extend the fake folders: skills, agents and commands in the account and the repo, a plugin cache with an enabled and a disabled plugin, memory with MEMORY.md and other files, shared through the linked profile. Exact totals.
- [ ] Quick tier green.
