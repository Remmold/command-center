# 03: Remote Control toggle per chat

**What to build:** a chat can turn on Remote Control the way the VS Code extension does, so Andreas can follow and steer it from claude.ai or his phone. It uses the same placement, wording and states, and shows the link the CLI returns.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Research first:
  - Where the extension puts the toggle, and its wording.
  - What the `remote_control` control request sends and receives (`enabled`, `session_url`, `connect_url`, `bridge_epoch`).
  - The lock and availability checks (`refresh_remote_control_lock`, `lockReason`), the startup auto-enable rules, the "Remote Control is off" offer text, and how off and disconnect are shown.
  - Record it in `docs/research/vscode-extension-controls.md`.
- [x] Toggle per chat, with states off → connecting → connected (link shown, copy and open in browser) → off, plus an error state with the CLI's message. Unavailable or locked shows the extension's reason. (Unavailable hides it as the extension does; the lock reason belongs to the left-out settings row, decision 74.)
- [x] Turning it on while the chat's process isn't running yet follows the pattern from hardening 01: store the choice, then send it once the process starts.
- [x] Session restart or resume follows the extension's rule for whether Remote Control comes back on.
- [x] Tests:
  - the pure state machine;
  - the fake CLI answers `remote_control` with a fake URL;
  - a smoke scenario where the toggle goes on, shows the link, then goes off.
- [x] Real CLI: control-only probes are allowed (no prompts) in a temp workspace under the scratchpad. Always send the off request afterwards and confirm the reply. Never leave a Remote Control session running.
