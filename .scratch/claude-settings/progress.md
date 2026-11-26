# claude-settings progress

Base commit: b4df18a (main), branch feat/claude-settings, worktree C:\projects\personal\command-center-claude-settings

- 01 resolved: settings file module (patch of changed keys, in place, conflicts, allowed paths), model-defaults save on it, Claude Code section with Account layer, Model & thinking, save bar, Review, Discard and leave guard — 65b7346, 2bca2c6
- 02 resolved: Repo and Local layers with workspace picker, effective value with source badge (organisation > local > repo > account, combined lists, hooks and objects, stricter exceptions), read-only organisation layer, layer rules, Reset, Open in Context view — ca4fb00 + review fixes
- 03 resolved: watch of the files on screen with a changed push, refresh keeping waiting changes, per-key mark, keep mine / keep the file's on Save, outside-write e2e check — a9b7a28 + review fixes
- 04 resolved: every documented setting in the catalog (157 keys, schema fixture with a 34-key skip list), stricter ladder, search, Show advanced, Hide terminal-only, All chats / Terminal only tags, Effort per model list — 2b09cc3 + review fixes
- 05 resolved: Other keys (list in the edited layer, raw JSON box checked on leave, Remove/Keep, search), emptied parents removed, watch test flake fixed — 403f7a5, 9d584e6, 8f6a55f, ad35fdb
- 06 resolved: carry-over fixes from 05 review, Permissions editor (rule lists in plain sentences, move/remove, rules from other layers, builder, shell risk warning) — 82763a5, 82964c8
- 07 resolved: carry-overs from 06 (permission lists and extra folders saved per item, an emptied list removed), Hooks editor (per event in plain words, matcher groups, add/edit/retype/remove every hook type, other layers read only) and status line editor — 1907213, 929ed99
- 08 resolved: carry-over hook events (skill shell command, model switches), Environment editor (name/value table per layer with the value that applies, 424 names offered, 79 described with typed inputs, secrets masked, ignored and retired names marked) — b0bebda, 45255aa
- 09 resolved: carry-overs (Claude Code section wraps in a narrow window, hook onFailure field), Key bindings (Account layer only, 27 contexts and 147 actions with built-in keys, keys set by pressing them incl. chords, unbind, reset, reserved keys refused, banner, keybindings.json through the file module, missing file made on Save, other bindings kept visible), section body scrolls inside the section — 25b6011, 6d86a32
