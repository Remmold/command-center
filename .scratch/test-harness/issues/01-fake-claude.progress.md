Round 2: code review fixes (no hang on stdin close during approval, broken script turns no longer wedge the fake, stricter flag parsing, absolute CC_CLAUDE_BIN, dedupe, comments); 384 tests green, build green.
Re-verified built app on the fake with temp user-data, workspace and CLAUDE_CONFIG_DIR: Manual mode, Write approval shown, Yes, reply seen; log has initialize, sent can_use_tool, received allow.
Resolved.
