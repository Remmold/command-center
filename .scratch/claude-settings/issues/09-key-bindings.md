# 09: Key bindings

**What to build:** a Key bindings category per account that lists every action by context with its current key, sets keys by pressing them, unbinds and resets, and edits the account's keybindings.json. Spec: `.scratch/claude-settings/spec.md` (user stories 37–41; "Setting catalog" key-binding catalog).

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Shown on the Account layer only, per account (Work's adopted folder included).
- [ ] A key-binding catalog lists every context and action with its built-in default key.
- [ ] Set a key by pressing it in a capture field, including chords (`ctrl+k ctrl+s`).
- [ ] Unbind a key and reset a binding to the built-in default.
- [ ] Reserved keys (Ctrl+C, Ctrl+D, Ctrl+M, Ctrl+[, Ctrl+I, Ctrl+H, Caps Lock) are refused with a reason.
- [ ] A banner says key bindings change terminal Claude, not this app's shortcuts.
- [ ] Saves go through the settings file module with the same save bar, review and conflict rules.
- [ ] Vitest: key capture to binding text round-trips, and reserved keys are refused.
