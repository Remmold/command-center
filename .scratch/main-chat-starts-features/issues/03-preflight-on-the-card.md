# 03: The card shows a taken name, branch or folder before Go

**What to build:** before Go is enabled the card asks main for the checks `createFeature` runs first and shows the reason, so nothing is overwritten and Andreas can ask the chat for another name. Spec: user stories 3, 6; Decisions "Preflight". ADR 0009.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] One shared function holds the checks (name valid and unused, workspace exists and is a repo, account intact, main branch found, folder free, branch free, brief within 20,000 characters) and its messages; `createFeature` calls it, so the card and `createFeature` cannot disagree. Each failure shows its existing message, unchanged.
- [ ] A new IPC returns that function's result for a workspace, name and brief; the card calls it when it appears and when the feature list changes.
- [ ] A live card with a problem shows the reason and "Ask the main chat for another name", with Go disabled. A card with no problem has Go enabled. The "Workspace unclear" card has no Go.
- [ ] The New feature dialog's own checks and messages are **identical** to before.
- [ ] Vitest: preflight and `createFeature` give the same message for each shared problem (taken name, branch exists, folder exists, not a repo, no main branch, removed account, brief too long); temp git repo for the branch and folder cases.
