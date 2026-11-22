# 01: Transcript looks like the VS Code extension, and file links open

**What to build:** Andreas compared the same chat side by side. The VS Code version is `scratchpad\parity-shots\vscode.png`, and Command Center 0.1.3 is `scratchpad\parity-shots\command-center.png`. Both are under `C:\Users\remmold\AppData\Local\Temp\claude\c85b1d19935b6b03\94ac3789-dfed-4f49-9914-b5b495f3362a\`. Make Command Center's transcript match the extension in every difference below. Also, file paths must open on click the way they do in VS Code. He said: "can't access pngs as easily as in vsc via click".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Differences seen, VS Code first and Command Center second:

- [ ] **Timeline.** VS Code joins the step dots with a thin vertical line and keeps rows compact. Command Center shows dots without a line and leaves large vertical gaps between rows. Take the extension's line, dot positions, colours and row spacing from the bundle's CSS.
- [ ] **MCP tool names.** VS Code shows `Meshy [meshy_check_balance]` and `Blender [execute_blender_code]`. Command Center shows the raw `mcp__meshy__meshy_check_balance`. Copy the extension's exact formatting rule from `webview/index.js`, including how it capitalises the server name.
- [ ] **Tool output.** VS Code shows an **OUT** box under a tool row with the start of the result on one line, cut off with an ellipsis, and it expands. Command Center shows nothing for MCP tools. Find which tools get IN and OUT boxes and how they expand, and match that.
- [ ] **Thinking durations.** VS Code shows "Thought for 2s" even for chats read back from the transcript `.jsonl`. Command Center shows a bare "Thinking", repeated. Work out how the extension gets a duration from the transcript, most likely from the timestamps between entries, and do the same. Collapse consecutive thinking rows the way the extension does.
- [ ] **Compaction line.** VS Code shows "Compacted chat · auto · 974k tokens freed" with an expander. Command Center shows "earlier conversation summarised". Match the wording, the data it uses (the trigger and the token counts from the compact boundary), and the expander.
- [ ] **File links.**
  - In VS Code, a Read row's file is a link (`SM_Chr_Blacksmith_Male_01.png`), and so are file paths in Claude's text. Clicking one opens it.
  - In Command Center, the Read row's path is plain text.
  - Make file paths clickable wherever the extension does: tool rows, Markdown links and inline code paths. Follow the extension's rules for which ones become links.
  - **Clicking opens the file:**
    - images (png, jpg, gif, webp, svg) in an in-app image preview, a modal with fit-to-window and Esc to close, and an "Open externally" button;
    - text and code files in the app's existing editor pane (Ctrl+Shift+E panels, or whatever the current panel shortcut is), or with the OS default app when that isn't available;
    - anything else with the OS default app (`shell.openPath`).
  - Paths resolve against the chat's workspace. A path outside the workspace still opens, but only if it exists. Never write anything.
- [ ] **Coverage:** this applies to hosted chats and to the read-only VS Code view alike, since they share the renderer.
- [ ] **Tests:**
  - pure: the MCP name formatting, the thinking-duration calculation from transcript timestamps, the compaction label and the path-to-link detection;
  - an e2e on the fake CLI: an MCP tool row shows `Server [tool]` with an OUT box, and clicking an image path opens the preview (use a temp workspace with a small png);
  - the perf guard stays green after `pnpm build`: `pnpm exec playwright test -c e2e/shots/playwright.config.ts perf`.
