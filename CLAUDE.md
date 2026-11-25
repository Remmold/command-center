# command-center

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each ticket. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commands

Package manager is pnpm (`pnpm install`).

- `pnpm dev`: run the app with hot reload
- `pnpm build`: production build into `out/`
- `pnpm test`: Vitest once (`src/`, `tools/` and `e2e/` `*.test.ts`, Node environment, no Electron)
- `pnpm dist`: build the per-user NSIS installer into `release/` (`release/win-unpacked/` is the unpacked app)
- `pnpm quick`: quick tier, typecheck + tests; non-zero on any failure. Run it every round.
- `pnpm e2e`: builds, then runs the Playwright UI suite (`e2e/*.spec.ts`) against the built app on the fake CLI (temp user data, workspace and config dir per test). Budget: at most 20 scenarios and 100 s. Slow, so not part of `pnpm quick`; it belongs to the full check before a merge or release. `pnpm e2e e2e/<file>.spec.ts -g "<name>"` builds and runs just those tests. The window may not reach the internet: any http(s) request fails the test.
- Releasing: follow `docs/agents/release.md` (UI suite once through `pnpm e2e:gate`, failed tests rerun only; a test audit every 5th release).
- Every commit that touches a non-`.md` file runs `pnpm quick` through `.githooks/pre-commit` (wired by `pnpm install`). A red quick tier blocks the commit; fix it, never `--no-verify`.
- Fake CLI for zero-token tests: set `CC_CLAUDE_BIN` to `tools/fake-claude/fake-claude.mjs` (scripts, log and variables in `tools/fake-claude/README.md`). Its replies are cloned from the recordings in `src/main/claude/fixtures/`.

`node-pty` loads its prebuilt N-API binaries in Electron, so no rebuild is needed. Its install script must still run (allowed in `pnpm.onlyBuiltDependencies`): it copies `conpty.dll` into place.
