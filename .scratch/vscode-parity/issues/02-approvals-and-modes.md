# 02: Approvals over stdio with the extension's prompt, and the mode picker with Shift+Tab

**What to build:** tool approvals arrive the way the extension gets them, as `can_use_tool` control requests on the session's own pipe, and are answered with the extension's numbered prompt. The PreToolUse hook, its `--settings` file and the localhost permission server are removed. The permission mode picker moves to the right of the prompt footer with the extension's labels. It changes the mode live, and Shift+Tab cycles through the modes.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Spawn with `--permission-prompt-tool=stdio`; drop `--settings` with the hook, the hook script install, `permissionLaunch`'s hook env and the localhost permission server; keep the legacy hook cleanup on app start (removeLegacyHook)
- [ ] An incoming `can_use_tool` request shows the approval prompt: the tool and its full input (command in full for shell tools), then numbered choices exactly as the extension: **1 Yes**; **2 Yes, allow … for this session / this project (just you) / this project (shared) / all projects**, one entry per permission suggestion the CLI sends (wording per the research doc section 5); **3 No** with a "Tell Claude what to do instead" text box. Keys 1/2/3 pick, Enter submits the feedback, Esc denies
- [ ] Replies: allow → `{behavior:"allow", updatedInput:<the input>, updatedPermissions:<the chosen suggestion(s), if any>}`; deny → `{behavior:"deny", message:<feedback or the extension's default text>, interrupt:<as the extension does>}`; envelope per the research doc, verified with a real run
- [ ] The session status (Needs approval / Running) and notifications keep working from these requests
- [ ] Mode picker on the right of the prompt footer with the extension's labels and order (Manual / Edit automatically / Plan / Auto / Bypass permissions, per research doc section 4; show only the modes the CLI reports as available); a change sends `set_permission_mode` to the running process and is stored for the session's next start; Shift+Tab in the prompt box cycles in the extension's order
- [ ] The old header permission menu is removed; existing sessions' stored modes migrate to the CLI mode names
- [ ] Tests (pure): suggestions → choices and reply payloads (allow with and without updatedPermissions, deny with feedback), the Shift+Tab cycle, mode migration
- [ ] Real-CLI check in a temp workspace: a Bash call in Manual mode shows the prompt; 1 runs it; 3 with feedback stops it and Claude reads the feedback; "allow for this session" stops the next identical prompt; switching to Plan mid-session takes effect without restart
