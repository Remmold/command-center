# Typing lag while sessions work

**Status:** ready-for-agent

## Problem Statement

Typing in the prompt box sometimes lags: keys appear late, in bursts, up to more than half a second behind. It happens whenever any hosted session (visible or not, including subagents) is running tool calls, and a little while a reply streams in. Idle, typing is instant.

Measured on the built app with the fake CLI (120 keystrokes per scenario):

| Scenario | median / p90 / worst ms | keys over 50 ms |
| --- | --- | --- |
| idle | 3 / 4 / 8 | 0 |
| visible 300-message chat streaming text | 5–6 / 7–10 / 27–37 | 0 |
| tool calls once a second, chat history 1.4 MB | 7 / 10 / 37 | 0 |
| tool calls once a second, chat history 22.7 MB (Andreas's size) | 6 / 456 / 621 | 35 |
| same, tool calls every 150 ms | renderer frozen ~32 s | – |

Causes, in order of weight:

1. **All chat history is re-saved on every new chat item.** The chat items store persists through zustand `persist` to one localStorage entry (`command-center.chat-items`). Every `set()` stringifies the whole state and writes it synchronously, even when nothing changed. Callers: each committed assistant block, tool result, result and system note, in any hosted session. Andreas's entry is ~22.5M characters across 14 sessions (biggest 7.2 MB); one write costs 31–68 ms stringify plus 77–101 ms setItem, two per tool call.
2. **The whole chat re-renders on every streamed delta.** Each `content_block_delta` calls `setInProgress`, one render per IPC event. The prompt box is not memoised and gets new inline props each render; the chat item list reruns its passes over the whole transcript (streaming merge, tool-result pairing, subagent grouping, row kinds, joins, stamps) and hands every tool row a new context value. Worst 27–86 ms in a 300-message chat.
3. **The project views store is rewritten on every streamed event for nothing.** Each event notes the Claude session id; the store's action returns the state unchanged, but `persist` still writes it: 32 writes/s while streaming, 74/s in a tool-call turn, ~2 KB each.

Not causes (checked): per-keystroke work (draft save, autosize, mention lookup, slash filtering), renderer timers, main-process timers, sync fs in hot paths.

## Solution

Typing stays instant while sessions stream and run tools, however much chat history is saved. Chat history moves out of browser storage into one file per hosted session, written by the background (main) process; the window only sends what changed. Existing history is moved over once on the first start of the new version. Streaming redraws only what changed, at most once per frame. Stores that did not change are not rewritten.

What Andreas sees otherwise is unchanged: every chat reopens with the same history after a restart, from the first frame.

## User Stories

1. As Andreas, I want typing in the prompt box to keep up with me while any session runs tool calls, so that I can write the next prompt without waiting.
2. As Andreas, I want typing to keep up while a reply streams into the chat I am in, so that I can draft a follow-up during the answer.
3. As Andreas, I want typing to keep up while background sessions and their subagents work, so that a busy session elsewhere never slows the one I am in.
4. As Andreas, I want the app to stay responsive however long my chats get, so that I never have to clear history for speed.
5. As Andreas, I want every chat to reopen with its full history after a restart, exactly as before, so that the change is invisible apart from speed.
6. As Andreas, I want my existing saved history carried over on the first start of the new version, so that no chat opens empty.
7. As Andreas, I want the old oversized browser-storage entry removed once its history is moved, so that it stops costing startup time and storage.
8. As Andreas, I want history saved by a session to survive a crash or force-quit, losing at most the last second or so, so that a crash does not cost me a chat.
9. As Andreas, I want deleting a session to delete its saved history file, so that removed chats do not pile up on disk.
10. As Andreas, I want clearing a chat to clear its saved history, so that it stays clear after a restart.
11. As Andreas, I want the cost estimate, Media tab, approval inbox, Dashboard and take-over history to show the same as today, so that nothing reading history breaks.
12. As Andreas, I want a damaged or half-written history file to cost only that session's history, not the app's start, so that one bad file never blocks me.
13. As Andreas, I want a permanent check that fails if typing lags again during a tool-call-heavy turn with a large history, so that this does not come back unnoticed.
14. As Andreas, I want streaming replies to look the same as today (text appears as it arrives), so that the per-frame batching is not visible.

## Implementation Decisions

- **Chat history store (main process), new module**, modelled on the sidebar groups store: one file per hosted session (pane id) in a folder under the app's user data folder. Interface, roughly: load all sessions' history; apply a batch of changes for one session; delete a session; import a legacy snapshot. Writes for one session happen in the order they came. A file that cannot be read yields an empty history for that session and does not throw at load.
- **Changes, not snapshots.** The renderer never serialises a whole session or the whole store. It sends small change records over IPC. Change kinds follow the chat items store's actions: append items; replace an assistant item by id (the result of joining a block to its message); set a session's items (whole list, rare: take-over, resume, legacy paths); clear; delete. The main process appends change records to the session's file (append-only log), so a run never re-serialises a whole session; it compacts a session's file to its current items when loading it. Sends may be batched per animation frame or short interval in the renderer; the main side may batch disk appends, with at most ~1 s of changes unwritten.
- **Chat items store (renderer)** keeps its actions and its in-memory shape (`items` by pane id), so every reader (chat view, cost estimate, Media tab, approval inbox, session header, Dashboard, project views, Remote Control, take-over, session navigation, sent thumbnails) is untouched. It drops zustand `persist` and localStorage; each action also emits its change record to the history bridge. The bridge is injectable so the store is testable without Electron.
- **Startup**: the renderer loads all sessions' history from the main process before chats render, so every chat shows its history from the first frame as today (it is read synchronously from localStorage today). The saved-scroll restore logic keeps working unchanged.
- **Migration, once**: on start, when the legacy `command-center.chat-items` localStorage entry exists, its sessions are imported into the new files (import wins only for sessions with no file yet), and the entry is removed after the import succeeds. An entry that cannot be parsed as chat history (bad JSON or the wrong shape) is removed too, with nothing imported, since it would fail the same way on every start. An import that fails for any other reason (a file write fails) leaves the entry in place for the next start.
- **Streaming redraw**: streamed deltas for a session are gathered and applied at most once per animation frame. The prompt box is memoised with stable callbacks so streaming and item commits do not re-render it. The chat item list keeps its derived data and the tool rows' context stable for committed items, so a delta re-renders only the streaming message.
- **Project views store**: the Claude session id is only set when it differs from the stored one (checked before calling the store), so a streamed event with an unchanged id writes nothing. Any other store found writing on an unchanged state on the per-event path gets the same guard.
- **ADR**: `docs/adr/0003-chat-history-in-files-per-session.md`.

## Testing Decisions

Good tests here check behaviour at a seam (what is saved and reloaded, how fast a key lands), not which internal function ran.

Seams (agreed at stop 2):

1. **Chat history store, main process** (Vitest, temp dir; prior art: the sidebar groups store test). Saved changes reload as the same items after a fresh store is created; changes apply in order; replace-by-id joins as the renderer does; delete removes the file; a corrupt file loads as empty for that session only (and is set aside as `.corrupt`), while a file whose last line was cut mid-write keeps the changes before the cut; a load compacts the file; legacy import fills only sessions without a file.
2. **Chat items store, renderer** (Vitest, fake bridge; prior art: the renderer store tests that stub localStorage). Each action emits the matching change record; no action writes to localStorage; migration imports the legacy entry and removes it only after the import resolves.
3. **Project views store** (Vitest): noting an unchanged Claude session id writes nothing to storage.
4. **Typing perf check, permanent** (Playwright on the built app, in the existing perf harness `e2e/shots`, not `pnpm quick` and not the e2e suite). Seeded with ~20 MB of chat history (about 30 extra 300-message transcripts); 120 keystrokes, focusing the textarea rather than clicking it; scenarios: a fake-CLI tool-call turn (text plus tool_use, one call per second) and a streaming text turn in a visible 300-message chat. Limits for each scenario: **no key over 50 ms and p90 under 20 ms** (today 456 ms p90 / 621 ms worst in the tool-call scenario). Bounds the p90 and the worst key, not the median (the median stayed at 6 ms in the bad case). Starting point: the research spec in `.scratch/typing-lag/research/typing.shots.ts` (with its config), copied into the harness. Run at ship time.

## Out of Scope

- Trimming what is saved (tool output size, duplicated raw event data). With saving off the UI thread, size no longer causes lag.
- Rebuilding history from Claude's own transcript files.
- Lazy loading of history per chat; all history still loads at start.
- Other localStorage stores (they are small).
- The board's 30 s full reread when an extra worktree exists, and the per-window event broadcast; checked, not causes.

## Further Notes

- The previous perf pass (`.scratch/perf/baseline.md`) seeded only 1.4 MB of chat history, where a save costs 2–6 ms, and its running turn sent no deltas or commits; that is why it missed this.
- Electron has one window, so one renderer writes history; no cross-window write races.
