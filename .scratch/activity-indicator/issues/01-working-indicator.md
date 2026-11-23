# 01: Show that Claude is working, as the VS Code extension does

**What to build:** Andreas: "vsc has activity flashes so you know it's working. we need something similar in CC." His screenshot of VS Code is `C:\Users\remmold\AppData\Local\Temp\claude\c85b1d19935b6b03\94ac3789-dfed-4f49-9914-b5b495f3362a\scratchpad\parity-shots\vscode-activity.png`; look at it with the Read tool first. It shows three signals. Command Center 0.1.4 has none of them clearly.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] **Working line.**
  - While a turn runs, the bottom of the transcript shows the extension's spinner line: an animated glyph (the orange "✻"-style asterisk) plus a rotating verb with "…", e.g. "Tinkering…".
  - Take the glyph frames, colours, animation timing, the verb list and how verbs rotate from the extension bundle `C:\Users\remmold\.vscode\extensions\anthropic.claude-code-2.1.330-win32-x64\` (`webview/index.js` and its CSS). Grep small windows only.
  - Include any extra the extension shows on that line, such as elapsed time, token count or "esc to interrupt". Check the bundle; don't invent.
  - The line disappears when the turn ends or is interrupted.
  - The line belongs to the current turn's last step on the timeline.
- [ ] **Running tool rows.** A tool call that is still running shows the extension's running state on its dot: blink, pulse or colour, per the bundle. It switches to the done or error colour when its result arrives. Apply this to hosted chats and to the read-only VS Code view; in the read-only view, use the transcript to know which call has no result yet.
- [ ] **Run in background.**
  - Under a running Bash call, the extension shows "Run in background". It uses the webview request `run_in_background` with a `toolUseId`; find what that sends to the CLI.
  - Mimic the placement and wording, and send the same control request. Find the exact subtype and fields in `extension.js`.
  - The fake CLI needs to answer it. Clone the shape from the bundle or the CLI schema rather than spending a real prompt.
- [ ] **Work list and Dashboard.** Make the existing Running dot in the Work list pulse while that chat's turn runs, if the extension has an equivalent; otherwise use a subtle pulse and log the decision.
- [ ] **Reduced motion.** Respect `prefers-reduced-motion`: show a static glyph and no pulse.
- [ ] **Performance.**
  - The animation must not re-render React each frame. Use CSS animation, or one small leaf component with a timer that only changes its own text.
  - The perf guard stays green: run `pnpm build`, then `pnpm exec playwright test -c e2e/shots/playwright.config.ts perf`.
  - The keystroke cost while a turn runs must stay under 16 ms. Add that case to the perf run if it isn't covered.
- [ ] **Tests:**
  - pure: verb rotation, plus which tool call is running, from live events and from transcript items;
  - e2e on the fake CLI with the slow script:
    - the working line appears during a turn and goes away after it and after Stop;
    - the running Bash row shows Run in background;
    - clicking it sends the right control request (check the fake's log).
