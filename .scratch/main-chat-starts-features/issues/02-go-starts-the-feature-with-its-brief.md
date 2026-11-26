# 02: Go starts the feature exactly as New feature does, with the brief saved and read first

**What to build:** a Go button on the live card. Pressing it makes the feature through the same `startFeature` the dialog uses, saves the brief as `.scratch/<name>/brief.md` in the new worktree and tells the new session to read it first. The card then reads Started with an Open session button. Spec: user stories 8, 11–17, 20; Decisions "Go", "Starting", "First prompt". ADR 0009.

**Blocked by:** 01

**Status:** resolved

- [x] Nothing is created until Go is pressed; typing "go" in the chat does nothing special. A second press while a feature is starting does nothing, so one Go makes one feature.
- [x] Go makes the worktree, branch, `.scratch` folder, install and session as New feature does; the feature appears in the digest and the Features group as usual. A feature started from the dialog is **identical** to before.
- [x] Main writes `.scratch/<name>/brief.md` inside `createFeature`, right after the worktree is added and before the install, so any failure rolls back with the rest. An existing `brief.md` fails the start and is never overwritten. Brief limit: 20,000 characters, checked by `createFeature`.
- [x] `featureFirstPrompt` gains an optional brief path and adds `Starting brief: <path> (agreed in the main chat; read it first, it holds what was already decided)`. Without a brief the prompt is **identical** to today's.
- [x] The card reads Started with an Open session button after success; the button opens the feature session. The card of a feature that exists reads Started after a restart.
- [x] A brief that cannot be saved (over 20,000 characters, folder not writable, `brief.md` already there) fails the start and undoes what was made; no feature exists without its brief.
- [x] Vitest (fakes and a temp git repo): `brief.md` written before the install; rollback when the write fails, when `brief.md` exists and when the brief is over the limit; first prompt with and without a brief; a second press starts nothing.
