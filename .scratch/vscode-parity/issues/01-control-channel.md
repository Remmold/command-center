# 01: Spawn like the extension and talk to the CLI over control requests

**What to build:** each hosted chat's Claude process is spawned with the extension's flags and gets a control channel. After spawn it runs the `initialize` handshake and keeps the models, account, commands and current mode. Stop interrupts the turn over the channel instead of sending a signal. Approvals keep working as today until ticket 02, so this ticket leaves the permission flags alone.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Control channel per session (main process): write `{"type":"control_request","request_id":<uuid>,"request":{"subtype":…}}` lines to stdin; match `{"type":"control_response","response":{"subtype":"success"|"error","request_id",…}}` by id; reject after 20 s; incoming `control_request`s from the CLI are routed to a handler (used by ticket 02) instead of the chat stream; `control_response`/`control_request` lines never reach the chat items
- [x] Spawn adds `--setting-sources user,project,local` to today's flags (keep `--input-format stream-json --output-format stream-json --verbose --include-partial-messages`, `--resume`, the current permission wiring)
- [x] Right after spawn: `initialize`; the session keeps `models` (value, displayName, supportsEffort, supportedEffortLevels), `account` (email, organization, subscriptionType, apiProvider), `commands` and `current_permission_mode`, and sends them to the renderer
- [x] Stop (button and Esc while a turn runs) sends `interrupt` instead of SIGINT; the process keeps running and the chat can continue
- [x] An IPC call lets later tickets send a control request to a session and get the reply
- [x] Tests (pure): request framing, response matching by id, error responses, timeout, routing of an incoming `can_use_tool` request, filtering control lines out of the chat stream — using recorded lines (the probe's real `initialize` and `get_usage` replies are in the research doc and `docs/research/vscode-extension-controls.md`)
- [x] Real-CLI check in a temp workspace: initialize reply arrives with models and account; "say hi" then Stop mid-stream interrupts and the next prompt still works
