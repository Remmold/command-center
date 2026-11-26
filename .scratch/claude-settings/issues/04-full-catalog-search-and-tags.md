# 04: Every simple setting in its category, with search, tags, advanced and warnings

**What to build:** the catalog grows to every key Claude Code documents as valid in user, project or local settings (sandbox and managed-only keys excepted), each in its category, with Show advanced, the All chats / Terminal only tag and filter, search, "Applies to new chats" and risk warnings. Complex keys (permissions rules, hooks, env, status line, key bindings) get their editors in tickets 06–09; until then they appear under Other keys (ticket 05) or as read-only JSON. Spec: `.scratch/claude-settings/spec.md` (user stories 3, 8, 9, 20–23; "Setting catalog").

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Every key that Claude Code documents as valid in user, project or local settings, except the sandbox keys and the managed-only keys, is in the catalog with label, description, category, control, default, valid layers, terminal-only, applies-only-to-new-chats and advanced.
- [ ] Common settings come first in each category; rare ones are behind Show advanced.
- [ ] Each setting is tagged All chats or Terminal only; a filter can hide terminal-only ones.
- [ ] Settings Claude reads only at start (model, effort) say "Applies to new chats".
- [ ] Effort (settled by the conductor from user story 57 and the docs): Model & thinking shows `effortLevel` as "Default effort for models with no saved level", plus a per-model list from `modelSettings` (one row per model id with its effort level, add/remove a model), which is what the chats' effort picker writes. Both say "Applies to new chats".
- [ ] Risky values with a warning: `permissions.defaultMode` = `bypassPermissions`; `disableAllHooks` = true; `skipDangerousModePermissionPrompt` = true; an Allow rule of bare `Bash`, `PowerShell` or `Bash(*)` (that rule warning shows in the Permissions editor, ticket 06).
- [ ] A search box finds settings by label, description or raw key name, across all categories.
- [ ] A bundled snapshot of the published settings schema is a test fixture: every schema key valid outside managed settings, sandbox excepted, is in the catalog or on a written-down skip list (Vitest).
- [ ] Vitest: every catalog key is unique, belongs to a listed category, and every choice has options and a default among them.
- [ ] UI suite: the `claudeSettings.spec.ts` scenario finds its setting by search. No new scenario.
