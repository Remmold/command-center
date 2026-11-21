# 01: pnpm, Vitest and a quick tier

**What to build:** the repo installs and runs with pnpm instead of npm. It gets a test runner and one quick-tier command (typecheck + tests) that every later ticket runs each round. The app still starts in dev with the native terminal module working.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `package-lock.json` replaced by a pnpm lockfile; the native terminal module's build script is allowed in pnpm config and the rebuild-for-Electron step still works
- [ ] Vitest added with a `test` script and one trivial passing test
- [ ] A quick-tier script runs typecheck + tests and exits non-zero on any failure
- [ ] The repo CLAUDE.md lists the dev, build, test and quick-tier commands
- [ ] `pnpm dev` boots the window and a shell tab opens (native module loads)
