# Account profiles are separate Claude config folders

Each account profile is its own Claude Code config folder, and the command center sets `CLAUDE_CONFIG_DIR` to it when it starts `claude` for a workspace. "Default" is the existing `~/.claude`. We chose this over swapping credentials in one shared folder because hosted sessions on different accounts run at the same time. One folder can only hold one login.

## Consequences

A new profile folder starts empty: no global CLAUDE.md, skills, plugins, settings or memory. Anything that should follow Andreas across accounts has to be shared into each profile on purpose. Code that reads `~/.claude` directly, such as the past-sessions list, must read the workspace's profile folder instead.
