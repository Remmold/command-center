# The main chat reads every known workspace and starts fresh after each start

The main chat plans with Andreas, so it needs to see what it plans against. Its read access widens from the digest and feature worktrees to every workspace Command Center knows, plus the test-flows folder. Its tools stay Read, Grep and Glob, and the app's path check now uses that wider set of roots. It still can't write, run commands or reach MCP servers. Every action stays a card that the app performs after a click (ADR 0009).

The chat starts a new Claude session after each successful Go, and from a Reset button. A started feature's plan lives in its brief.md, so nothing agreed is lost. A long-lived chat carries old refusals and old instructions that argue with new ones.

## Considered Options

- **Reset by token count**: automatic, but it cuts a planning discussion mid-thought.
- **Keep the narrow scope**: plans are written blind; the digest listed 0 features while about 45 specs existed.
