# command-center

Single-window desktop app for running multiple Claude Code projects in parallel.

Each open project gets its own pane with an embedded `claude` CLI session (real Claude Code, not a reimplementation), a read-only git diff sidebar, and a status indicator (idle / running / awaiting-input). Layouts are adjustable split panes with 1-up / 2-up / 2x2 presets.

> Status: early work-in-progress. v1 in progress, see `plans/` for the build order.

## Prerequisites

- **Node.js 20+** and **pnpm 10**
- **Claude Code CLI** on PATH (`claude` or `claude.cmd`). See https://docs.claude.com/en/docs/claude-code for install.
- **Windows:** nothing extra. `node-pty` ships prebuilt binaries that load in Electron as-is; Visual Studio Build Tools are only needed to build it from source.

## Run (dev)

```sh
pnpm install
pnpm dev
```

This opens the Electron window with hot reload for the renderer.

## Build

```sh
pnpm build
pnpm start
```

## Layout

```
src/
  main/        Electron main process (Node) — pty, hooks server, git, project store
  preload/     contextBridge surface exposed to the renderer
  renderer/    React + Tailwind UI
  shared/      types shared between main and renderer
```

User data (project list, hook helper script) lives in `%APPDATA%/command-center/` (Windows) — never in the repo.

## Status / build order

The phased plan lives outside the repo. v1 phases: A scaffold → B project store → C single terminal pane → D multi-pane layout → E git/diff sidebar → F status indicator + hook integration → G polish.

## License

Personal project, public for transparency. No license attached yet.
