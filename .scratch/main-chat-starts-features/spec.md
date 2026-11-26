# Main chat starts features

Status: ready-for-agent

## Problem Statement

Andreas plans in the main chat but has to leave it to start the feature: open New feature, pick the workspace, retype a description, and the agreed plan stays behind in a chat that resets to keep its context small. The feature session then starts without the plan.

## Solution

The main chat can **propose** a feature when a plan is agreed. The proposal shows in the chat as a card with four fields: workspace, name, description and **starting brief**. Andreas presses **Go** and the app starts the feature exactly as New feature does (same worktree, branch, `.scratch` folder, session), plus the brief saved as `brief.md` in the feature's `.scratch` folder, which the new session is told to read first. New feature stays as the fallback. Design reasons are in ADR 0009: the chat gains no tool and no write access; a proposal is text and the app acts.

## User Stories

### Proposing

1. As Andreas, I want to say "start it" after we agree a plan and get a card with the workspace, name, description and starting brief, so that I can check what will be made.
2. As Andreas, I want the workspace picked only from the workspaces Command Center knows, so that a feature never lands in a folder it has not heard of.
3. As Andreas, I want the chat to ask which workspace when it is unclear, and the card to refuse a workspace name that matches none or several, so that nothing is guessed.
4. As Andreas, I want the name in folder-and-branch form and the description to be what New feature would take, so that the feature looks the same as one started from the dialog.
5. As Andreas, I want the card to show the whole brief, so that I see what the new session will read.
6. As Andreas, I want a name that is already used, or whose branch or folder exists, shown on the card before I press Go, with Go disabled, so that nothing is overwritten and I can ask the chat for another name.
7. As Andreas, I want several features from one discussion proposed one after another, each with its own card and Go, so that each is confirmed separately.

### Consent

8. As Andreas, I want nothing created until I press Go on the card, so that the chat can never start a feature by itself.
9. As Andreas, I want a changed field to produce a new card that needs a new Go, and the old card to turn read-only, so that I never press Go on a version I did not read last.
10. As Andreas, I want only the newest card to be live, and any later message in the chat (mine or the app's) to make older cards read-only, so that a card from yesterday cannot be pressed.
11. As Andreas, I want a card whose feature exists to read as Started (with an Open session button), and any other old card to read as Superseded, so that I can tell them apart after a restart.
12. As Andreas, I want a second press while a feature is starting to do nothing, so that one Go makes one feature.

### Starting

13. As Andreas, I want Go to make the worktree, branch, `.scratch` folder, install and session as New feature does, so that nothing differs.
14. As Andreas, I want the brief saved as `.scratch/<name>/brief.md` in the new worktree, so that the plan survives the main chat resetting.
15. As Andreas, I want the new session's first prompt to say "Starting brief: <path>, read it first", so that it opens with the plan loaded.
16. As Andreas, I want the card to show Started with an Open session button, and the chat told in one short message so it confirms in words and says where to continue, so that I know where to go.
17. As Andreas, I want the feature in the digest and the Features group as usual.

### Failure

18. As Andreas, I want a failed start to name the step that failed and what, if anything, was left behind (worktree, branch, folder, workspace entry), so that I can clean up.
19. As Andreas, I want no automatic retry; the chat is told the failure and waits for me.
20. As Andreas, I want a brief that cannot be saved (too long, folder not writable, `brief.md` already there) to fail the start and undo what was made, so that no feature exists without its brief.

### Limits

21. As Andreas, I want the main chat still unable to stop, complete, reopen or delete a feature, to edit code or to run commands in a worktree, so that its only new power is proposing.
22. As Andreas, I want a chat resumed from before this feature to know how to propose, so that I do not have to reset it.

## Decisions

- **Channel:** a fenced block tagged `feature-proposal` in an assistant reply, four labelled parts (workspace, name, description, brief). The block is written with a four-backtick fence so a brief may contain fenced code. Parser and the chat's instructions live in one shared module with tests. A block that does not parse shows as ordinary text and a one-line note "Proposal not understood, ask the chat to write it again"; it has no Go.
- **Go:** a button on the card. Typing "go" does nothing special; the chat's instructions tell it to point at the button.
- **Liveness:** a card is live when it is the last proposal in the transcript, no user message follows it and the chat has settled its turn. Derived from the transcript; nothing is stored. A non-live card whose `name` equals an existing feature's name reads Started, else Superseded.
- **Workspace resolution:** the card matches the proposal's workspace text against the labels the New feature dialog's Workspace picker shows (`workspaceLabel`, same list). Exactly one match resolves; none or several shows "Workspace unclear" and no Go. The digest gets a **Workspaces** section listing those labels, so the chat copies them.
- **Preflight:** before enabling Go the card asks main for the checks `createFeature` runs first (name valid and unused, workspace exists and is a repo, account intact, main branch found, folder free, branch free). One shared function; `createFeature` uses the same one, so the two cannot disagree. Each failure shows its existing message.
- **Starting:** the card calls the same `startFeature` the dialog calls, with the brief added to the request. Main writes `.scratch/<name>/brief.md` inside `createFeature`, right after the worktree is added and before the install, so any failure rolls back with the rest. An existing `brief.md` fails the start; it is never overwritten. Brief limit: 20,000 characters, checked by preflight and by `createFeature`.
- **First prompt:** `featureFirstPrompt` gains an optional brief path and adds `Starting brief: <path> (agreed in the main chat; read it first, it holds what was already decided)`. Without a brief the prompt is identical to today's.
- **Report:** a failure message names the failed step and what remains, read from the rollback's own results (what it could not remove), not assumed. After success or failure the app sends the chat one short message beginning `[Command Center]`; the chat's instructions say to confirm a success in words and where to continue, and to report a failure and wait.
- **Instructions:** the chat's rules (may propose, never claims to have started anything, one proposal at a time, point at the Go button, read-only otherwise) are added to its launch arguments as an appended system prompt, so a resumed chat has them. The first prompt keeps the digest pointer.
- **Unchanged on purpose:** `READ_ONLY_TOOLS`, the denied list, `--strict-mcp-config`, `mainChatReply`, the digest's per-feature blocks, the New feature dialog, the flow skill. (The `/flow` skill may later be told to start from `brief.md`; that is Andreas's global skill and out of scope.)
- **Headroom:** no new stored ids, message fields or carry bits; no native/generated boundary crossed; no free ids to reserve. One new IPC (preflight) and one new field on the create request (brief).
- **Security:** the proposal is model text that may come from files the chat read. Go is the barrier, and the card shows the full brief so nothing is written unseen.

## Out of Scope

- Stopping, completing, reopening or deleting features from the main chat.
- Editing the `/flow` skill or other global skills.
- Proposing for a workspace the app does not know (add it in the app first).
- Auto-opening the new session; the card's Open session button does it.
- A way to edit fields on the card itself; changes go through the chat, which writes a new card.

## Testing Decisions (seams)

- **Pure, shared:** the proposal parser and the instructions text (round trip, four-backtick brief with a fenced code block inside, missing part, two blocks); the liveness and Started/Superseded derivation over a list of chat items; workspace resolution (one, none, several); `featureFirstPrompt` with and without a brief (without: identical to today's).
- **Main, with fakes:** `createFeature` writes `brief.md` before the install and rolls back when the write fails, when `brief.md` exists, when the brief is over the limit; preflight and `createFeature` give the same message for each shared problem; the failure report lists what the rollback could not remove; the digest has the Workspaces section and nothing else in its per-feature blocks changed.
- **Launch:** the main chat's arguments still list only the read tools and the denied list, still `--strict-mcp-config`, and now carry the appended instructions.
- **UI suite (1 scenario: 17 of 20 now, 18 of 20 after; stays under the 200 s budget):** the fake CLI main chat replies with a proposal; the card appears; Go starts the feature; `brief.md` exists in the new worktree and the new session's first prompt names it.
- **By hand (Lane 2):** a real main chat on Haiku writes a proposal in the block format on its own, the card looks right, Open session lands in the feature.

## Further Notes

Counts quoted come from `pnpm e2e:count` (17 of 20 on 2026-11-26). Closed ticket word in this repo: `resolved`; `built` when only a person can check a criterion.
