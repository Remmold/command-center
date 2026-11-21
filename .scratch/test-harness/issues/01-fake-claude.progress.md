Round 1: fake CLI + 24 tests green, CC_CLAUDE_BIN wired into locateClaude (chat + usage probe), Default profile honours CLAUDE_CONFIG_DIR under the fake.
Built app launched on the fake with temp dirs: usage strip from get_usage, Manual-mode Write approval round trip and reply seen; log shows initialize, can_use_tool sent, allow received.
Next: code review, then resolve.
