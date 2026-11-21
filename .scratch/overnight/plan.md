# Overnight plan (2026-11-21 → 22)

Decided with Andreas before he left (grill, three rounds).

## Queue, in order

1. **VS Code parity 03**: model pill, effort, Thinking, and the allow-bypass setting. Building now.
2. **VS Code parity 04**: every account's usage at the top right, plus the account switch in the header.
3. **Deny feedback fix**: same look as the extension, but the message sent to Claude clearly marks the text as the user's own feedback, so Claude follows it instead of treating it as injection. This is the only deliberate difference from the extension.
4. **Fake CLI**: a stand-in `claude` that replays recorded stream-json conversations (control requests included) for zero-token testing.
5. **Rest of extension parity**: the slash-command menu, the @-file menu, image paste, session history and resume, and the input shortcuts, all exactly like the extension (research doc first).
6. **Automated UI tests**: a Playwright-for-Electron smoke suite on the fake CLI (open app, start chat, approve, switch views).
7. **Daily-driver hardening**: run the app for hours on the fake CLI and fix every crash, freeze, lost state or ugly edge. That covers restarts, long chats, many sessions, sleep/wake and CLI updates.
8. **Dashboard and Board polish**: judged from screenshots against VS Code and GitHub Projects.

## Rules for the night

- **Tokens:** real Claude only for the final check of features that talk to it: Haiku, low effort, one-line prompts, at most ~5 prompts per feature. Control-only probes cost nothing and may be used freely. Everything else runs on the fake CLI.
- **Build agents:** Opus, as tonight.
- **Shipping:** after a feature's full ship check is green, merge it to `main` and push. Anything red stays on its branch.
- **Install:** once, at the end. Quit the command center and run the final installer, only when no chat in it is Running or waiting on approval.
- **Decisions:** pick the option closest to "like the VS Code extension", log it in `.scratch/overnight/decisions.md` with the alternative, and keep going. Park only things that are irreversible or outward-facing.
- **Never touch** Andreas's real `~/.claude` settings, credentials, repos or `%APPDATA%` data in tests. Use temp homes, temp `--user-data-dir` and temp workspaces.
- **Morning:** one test-flow run covering everything that landed, the decisions log, and one summary message.
