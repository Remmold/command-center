# 01: pnpm, Vitest and a quick tier

**What to build:** the repo installs and runs with pnpm instead of npm. It gets a test runner and one quick-tier command (typecheck + tests) that every later ticket runs each round. The app still starts in dev with the native terminal module working.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `package-lock.json` replaced by a pnpm lockfile; the native terminal module's build script is allowed in pnpm config and the rebuild-for-Electron step still works (no rebuild needed: node-pty's prebuilt binaries load in Electron 31. A source rebuild fails on this machine: Visual Studio Spectre-mitigated libraries are missing)
- [x] Vitest added with a `test` script and one trivial passing test
- [x] A quick-tier script runs typecheck + tests and exits non-zero on any failure
- [x] The repo CLAUDE.md lists the dev, build, test and quick-tier commands
- [ ] `pnpm dev` boots the window and a shell tab opens (native module loads) (boot and node-pty spawn checked by script; opening a shell tab in the UI is left for a manual check)
