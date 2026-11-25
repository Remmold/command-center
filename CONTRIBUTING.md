# Contributing

Thanks for wanting to help. Issues and pull requests are welcome.

## Before you start

- Command Center drives the official Claude Code CLI (`claude`) with your own login; it does not ship or proxy any Claude access.
- It is Windows-first today. macOS/Linux fixes are very welcome.
- For anything bigger than a bug fix, open an issue first so we can agree on the approach.

## Setup

```
pnpm install
pnpm dev
```

`pnpm install` also wires a pre-commit hook that runs the quick checks.

## Checks

- `pnpm quick` — typecheck and unit tests. Must pass for every commit.
- `pnpm e2e` — the UI suite against the built app. It runs on a **fake Claude CLI** (`tools/fake-claude/`), so it costs no tokens and needs no login; test windows open off-screen.
- The UI suite has a budget (at most 20 scenarios, about 100 s). Prefer unit tests on pure logic; extend an existing UI scenario rather than adding one.

## Pull requests

- Keep a PR to one change, with a short description of what changed and why.
- Include tests for logic changes.
- Don't commit secrets, credentials, or anything from your own Claude config folder.

By contributing, you agree your contribution is licensed under the [MIT License](LICENSE).
