# A feature owns its worktree, its ports and its browser store

Superseded by ADR 0012: the main chat and features made by the app were removed.

Every feature made through New feature gets its own git worktree, its own reserved local ports and its own browser cookies and storage. Nothing about a feature's test setup is shared with another feature of the same repo. That is what lets two features of one project run and be tested at the same time, and what makes Complete safe: stopping one feature's servers and dropping its browser store can touch nothing else.

The main chat is told about features through a digest file the app keeps up to date, not through a tool it calls. It stays read-only by construction, because it has no way to act.

## Considered Options

- **Shared checkout, shared dev ports**: cheaper, but two features of one repo cannot be tested together, and a port clash is found at boot.
- **One browser store per project**: logins survive between features, but localhost cookies ignore ports, so two features' servers would overwrite each other's session.
- **A tool the main chat calls (an MCP server in the app)**: always exact, and could act, but it is a second channel into the app for a chat that should only answer.
