# 02: Repo and Local layers, effective value and where it comes from

**What to build:** the Repo and Local layers become editable for a chosen workspace, and every row shows the effective value for that workspace with a badge naming the layer it comes from. Organisation settings show locked. Spec: `.scratch/claude-settings/spec.md` (user stories 13–19, 24, 56; "Setting catalog" merge rules, "Settings file module" organisation layer).

**Blocked by:** 01

**Status:** resolved

- [x] Repo and Local layers have a workspace picker. Repo says its file is committed and shared with everyone on the repo; Local says it applies only to Andreas in this folder.
- [x] Each layer shows the path of the file it edits, with a button that opens the Context view on that workspace and file.
- [x] Each row shows the value in the edited layer and, beside it, the effective value for the chosen workspace, with a badge naming the layer it comes from ("From Account", "Overridden by Local", "Set by your organisation", and the matching Repo wording).
- [x] Merge rules for the effective value: higher layer wins in the order organisation > local > repo > account; arrays in `permissions.allow`/`ask`/`deny`/`additionalDirectories` and hooks combine across layers; `env` and other objects combine per key; the docs' exceptions (stricter values that beat higher layers) are encoded where the catalog marks them.
- [x] Organisation layer, read only: `managed-settings.json` in the Windows system location and `remote-settings.json` in the account's folder, when present. Settings it sets show locked with "Set by your organisation".
- [x] Layer rules from the catalog: `permissions.defaultMode` values `auto` and `bypassPermissions` are only valid in the account layer; `modelPicker`, `askUserQuestionTimeout`, `autoMode`, `permissions.denyInsteadOfPrompting` and the other "user or managed" keys are account-only; `useAutoModeDuringPlan`, `syncClaudeAiSkills`, `syncClaudeAiPlugins` and `skipDangerousModePermissionPrompt` are not valid in the repo layer. Such rows say so and are read-only in the layers where they don't count.
- [x] Reset per row removes the key from the edited layer.
- [x] Vitest (pure): the effective value follows the layer order and the array/object merge rules, with the organisation lock and the account-only `defaultMode` values.

## Comments

- The Account layer has no workspace picker; its effective value uses the chosen workspace when it is on that account, else the first workspace that is, and the file line names it ("What applies is shown for …"). Repo and Local read the chosen workspace's own account as their account layer.
- Organisation: the account's `remote-settings.json` when it sets any key, else `C:\Program Files\ClaudeCode\managed-settings.json` (Claude uses the first managed source with a policy). An empty `{}` falls through.
- An organisation value locks a row, except for the lists and objects that combine across layers (permission rules, hooks, env), where it shows as one of the sources.
- The docs' "stricter value wins" exceptions are the catalog's `stricter` field: `useAutoModeDuringPlan`, `syncClaudeAiSkills`, `syncClaudeAiPlugins` (off from organisation, Local or Account) and `permissions.denyInsteadOfPrompting` (on from Account). Ticket 04 should mark the others the docs list (`disableClaudeAiConnectors`, `enableArtifact`, `permissions.blockReadsOutsideWorkingDirectories`/`blockWritesOutsideWorkingDirectories`, `remoteControlAtStartup`, `crossSessionInbound`, `maxEffortLevel`, `autoMode.classifyAllShell`) as it adds them.
- The new rows (permission mode, the account-only and not-in-repo keys) are not advanced yet: there is no Show advanced until ticket 04.
- Review (since da418e7): the module is `claudeSettingsEffective.ts` (the glossary avoids "merged"); an organisation file that does not parse shows a banner instead of being skipped; hook groups two layers share count once. Left as is: "Overridden by Local" also shows on Account when Account doesn't set the key (the change would not take effect); the `askUserQuestionTimeout` choices (`60s`, `5m`, `10m`, `never`) come from a summary of the docs, so ticket 04 should check them against the schema.
