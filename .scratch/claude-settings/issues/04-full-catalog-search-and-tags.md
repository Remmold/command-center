# 04: Every simple setting in its category, with search, tags, advanced and warnings

**What to build:** the catalog grows to every key Claude Code documents as valid in user, project or local settings (sandbox and managed-only keys excepted), each in its category, with Show advanced, the All chats / Terminal only tag and filter, search, "Applies to new chats" and risk warnings. Complex keys (permissions rules, hooks, env, status line, key bindings) get their editors in tickets 06–09; until then they appear under Other keys (ticket 05) or as read-only JSON. Spec: `.scratch/claude-settings/spec.md` (user stories 3, 8, 9, 20–23; "Setting catalog").

**Blocked by:** 02

**Status:** resolved

- [x] Every key that Claude Code documents as valid in user, project or local settings, except the sandbox keys and the managed-only keys, is in the catalog with label, description, category, control, default, valid layers, terminal-only, applies-only-to-new-chats and advanced.
- [x] Common settings come first in each category; rare ones are behind Show advanced.
- [x] Each setting is tagged All chats or Terminal only; a filter can hide terminal-only ones.
- [x] Settings Claude reads only at start (model, effort) say "Applies to new chats".
- [x] Effort (settled by the conductor from user story 57 and the docs): Model & thinking shows `effortLevel` as "Default effort for models with no saved level", plus a per-model list from `modelSettings` (one row per model id with its effort level, add/remove a model), which is what the chats' effort picker writes. Both say "Applies to new chats".
- [x] Risky values with a warning: `permissions.defaultMode` = `bypassPermissions`; `disableAllHooks` = true; `skipDangerousModePermissionPrompt` = true; an Allow rule of bare `Bash`, `PowerShell` or `Bash(*)` (that rule warning shows in the Permissions editor, ticket 06).
- [x] A search box finds settings by label, description or raw key name, across all categories.
- [x] A bundled snapshot of the published settings schema is a test fixture: every schema key valid outside managed settings, sandbox excepted, is in the catalog or on a written-down skip list (Vitest).
- [x] Vitest: every catalog key is unique, belongs to a listed category, and every choice has options and a default among them.
- [x] UI suite: the `claudeSettings.spec.ts` scenario finds its setting by search. No new scenario.

## Comments

- The catalog has 157 keys. The schema test's skip list has 34 entries: `$schema`, `sandbox`, `permissions.disableAutoMode` (another spelling of `disableAutoMode`), 25 managed-only keys and 6 keys that live in `~/.claude.json`. Two documented keys are left out because the docs say they no longer do anything: `keybindingFlavor` and `taskOutputMaxChars`. Neither is in the schema; a file that has them will show them under Other keys.
- Object keys with simple parts are split into rows for those parts: `attribution.*`, `worktree.*` and `voice.*`. `spinnerVerbs` stays one read-only row because its `verbs` list is required. Complex keys (permission rule lists, hooks, env, the status lines, `autoMode`, `modelPicker`, plugin and MCP maps, `spellcheck`, `forceLoginOrgUUID`) show their value read only until tickets 05–09.
- `stricter` is now a ladder from least to most strict, plus `onlyStricter` for layers that count only with a stricter value. Every key in the docs' exceptions table is marked, `isolatePeerMachines` included. On these rows an organisation value doesn't block the layers that may still set a stricter one.
- Known simplifications: a Repo or Local `true` for `bashEditDiffEnabled` counts as a normal value (the docs ignore it). The `modelSettings` per-model rows only resolve each model's object by layer order, without the top-level `effortLevel` that also applies. Removing a model's effort can leave an empty `{}` for that model in the file.
- Out-of-range numbers are clamped to the documented range when staged. The `askUserQuestionTimeout` choices match the schema's enum (`60s`, `5m`, `10m`, `never`).
- Hosted chats run `--print` with stream-json, so the settings for the terminal screen, keys and notifications are tagged Terminal only.
