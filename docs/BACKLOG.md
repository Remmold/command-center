# command-center — feature backlog

Tracks the planned work to reach feature parity with the Claude Code VS Code extension. Batches are sized to fit in one focused work session; each batch ends in something testable.

## Done

- [x] Phase A – Scaffold (electron-vite + React + TS + Tailwind)
- [x] Phase B – Project store (zustand + `%APPDATA%` persistence + Add/Remove UI)
- [x] Phase C – PTY layer (node-pty + xterm, kept for shells; Claude moved off it)
- [x] Phase D – Per-project IDE layout (sidebar switch, top split, bottom shells, sessions persist across switches)
- [x] Chat rewrite – Claude pane on stream-json protocol (no terminal); user/assistant bubbles, tool-use & tool-result cards, turn footer
- [x] Multi-session – multiple chat tabs per project, model picker (sonnet/opus/haiku)
- [x] Markdown rendering in assistant messages
- [x] Subscription-friendly usage bar (rate-limit window + tokens by model)

## Batch A — Persistence (in progress)

Goal: chats survive app restart; Claude resumes via `--resume <session_id>`.

- [ ] Persist `projectViewsStore` (projects, sessions, model picks, layout state) to localStorage via zustand persist
- [ ] New `chatItemsStore` keyed by paneId, persisted (so chat history survives restart and HMR)
- [ ] Track `claudeSessionId` per chat session (extracted from `session_id` field in claude events)
- [ ] Backend: `claude.start` accepts a `resumeSessionId` and passes `--resume <id>`
- [ ] ChatView: lazy-start (don't spawn claude until user sends or clicks resume); show existing items immediately
- [ ] Per-session "clear" action that nukes items + claudeSessionId for a fresh restart
- [ ] Usage store also persisted (today's tally + global token tally survive restart)

## Batch B — Streaming + visual polish

- [ ] Handle `stream_event` partial messages → typing effect on assistant text
- [ ] Code block syntax highlighting (shiki or prism)
- [ ] File diff rendering for `Edit` tool calls (parse `old_string` / `new_string`, render unified diff)
- [ ] File diff rendering for `Write` tool calls (full content view)
- [ ] Better tool-call summaries (file paths shortened, command truncated)

## Batch C — Input enhancements

- [ ] Slash command autocomplete (read commands list from `system/init`, popup on `/`)
- [ ] File @-mention picker (`@` triggers fuzzy file search in cwd)
- [ ] Image paste/drop attachment support
- [ ] Multi-line drag-resize on the input box

## Batch D — Session management

- [ ] Rename a session (double-click tab or right-click)
- [ ] Sidebar listing of past sessions per project (loadable from claude's local session storage)
- [ ] Pin/favorite a session
- [ ] Duplicate / fork a session
- [ ] Export conversation as markdown / JSON

## Batch E — Tool & permission UX

- [ ] Permission-mode picker per session (default / acceptEdits / plan / bypassPermissions)
- [ ] Inline approval prompts when Claude requests dangerous tool use
- [ ] Per-session tool allow/deny list
- [ ] Surface denial reasons in chat

## Batch F — Convenience

- [ ] "Show usage" button that injects `/usage` into current chat
- [ ] Global search across all sessions for a project
- [ ] Resume-from-CWD: detect if Claude has prior sessions in the project dir and offer to load
- [ ] Auto-open last project / last session on launch (configurable)

## Batch G — Final polish

- [ ] Settings panel (default model, default permission mode, theme, keybindings)
- [ ] Keyboard shortcuts (cmd+k focus chat, cmd+t new chat, etc.)
- [ ] Better empty states
- [ ] README updated with screenshots
- [ ] `.gitignore` audit
- [ ] First-launch onboarding (point at Claude install / auth)

## Out of scope (for now)

- Forking VSCodium / Monaco-based code editor
- Mac/Linux CI matrix
- Code signing / auto-update
- Plugin system
