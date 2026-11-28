# Sessions only: no main chat and no features made by the app

Work is started from New session in a workspace, and that is the only way the app starts a Claude session for Andreas. The main chat, its action cards and the feature digest are removed, and so is everything that only a feature made by the app used: New feature, adopting open work, feature worktrees and ports, the Features group in Work, the preview config, the preview browser, the test pair, test steps and Complete. This supersedes ADR 0008, 0009 and 0010. A planner that could only act through cards, and a second kind of session with its own rules, cost more to keep working than they saved over picking a workspace and starting a session. The Board, a session's Test tab, drift checks and the 3D service stay as they were.

On first start after the change, the main chat's leftover workspace record and its saved view are removed, so its folder never shows as a workspace. A feature's worktree workspace stays an ordinary workspace, and its session an ordinary session there.

## Considered Options

- **Keep feature cockpits for features that already exist**: nothing could start a new one, so it would be dead code that still had to be kept working.
