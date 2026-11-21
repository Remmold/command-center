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
- `pnpm test`: Vitest once (`src/**/*.test.ts`, Node environment, no Electron)
- `pnpm quick`: quick tier, typecheck + tests; non-zero on any failure. Run it every round.

`node-pty` loads its prebuilt N-API binaries in Electron, so no rebuild is needed. Its install script must still run (allowed in `pnpm.onlyBuiltDependencies`): it copies `conpty.dll` into place.
