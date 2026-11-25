# Chat history is saved in one file per session by the main process

Hosted sessions' chat history used to live in one localStorage entry that zustand rewrote in full on every new item; at ~22M characters each rewrite blocked the renderer for 110–170 ms and made typing lag whenever any session ran tools. History now lives in one file per session under the app's user data folder. The renderer sends only what changed over IPC and never serialises history itself; the main process appends the changes and compacts a session's file when it loads it.

## Considered Options

- **localStorage, one entry per session, batched writes**: smaller change, but rewriting a 7 MB session still blocks the renderer ~50 ms, and the origin's storage cap stays close.
- **No copy at all, rebuild from Claude's own transcript files**: loses app-only items (Remote Control notes, take-over notices) and needs a loader per case.
