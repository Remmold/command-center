# 01: Suggested next prompt, accepted with Tab

**What to build:** Andreas (2026-11-24): "VS Code has the suggested reply to prompts, via Tab." From the extension bundle (2.1.330):
- The CLI emits `{"type":"prompt_suggestion","suggestion":"…"}` lines after a turn.
- The webview keeps `promptSuggestion`, clears it when a turn starts or the process restarts, and shows it as ghost text that Tab accepts.
- The extension knows the env flag `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION` (in its env list next to `CLAUDE_CODE_ENABLE_TASKS`, which the app already sets), and settings carry `promptSuggestionEnabled` (false disables it).

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Enabling it:** find out from `extension.js` how the extension enables suggestions: whether it sets the env var and with which value, or passes a flag. Do the same at CLI launch for hosted chats. Respect `promptSuggestionEnabled: false` in the account's settings, and add a Settings → General toggle "Suggest next prompt" (default on, as the extension does). Turning it off launches new chats without it.
- [x] **Handling it:** parse `prompt_suggestion` lines per chat. Keep only the latest. Clear it when a turn starts, on send, on interrupt, or on a process restart, as the extension does.
- [x] **Showing it:** when the prompt box is **empty**, show the suggestion as grey ghost text. **Tab** fills the box with it (it does not send). Typing anything hides it. Esc dismisses it. It must not clash with Tab in the slash or @ menus, which still win when open. Match the extension's exact look and keys from `webview/index.js`.
- [x] **Cost note:** the suggestion is an extra small model call by the CLI. Mention it in the setting's description: "Claude suggests a next prompt after each reply (uses a little of your usage)".
- [x] **Tests:**
  - pure: the suggestion state (set, clear on start/send/interrupt/restart, hidden when the box isn't empty, Tab result);
  - the fake CLI emits a `prompt_suggestion` after a turn (shape from the bundle). Extend an existing chat step: the ghost text shows, Tab fills the box, typing hides it, and the next send clears it. **No new scenario.**
  - Gate: quick, `e2e:gate`, perf and zoom.
