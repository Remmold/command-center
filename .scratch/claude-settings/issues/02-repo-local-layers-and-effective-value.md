# 02: Repo and Local layers, effective value and where it comes from

**What to build:** the Repo and Local layers become editable for a chosen workspace, and every row shows the effective value for that workspace with a badge naming the layer it comes from. Organisation settings show locked. Spec: `.scratch/claude-settings/spec.md` (user stories 13–19, 24, 56; "Setting catalog" merge rules, "Settings file module" organisation layer).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Repo and Local layers have a workspace picker. Repo says its file is committed and shared with everyone on the repo; Local says it applies only to Andreas in this folder.
- [ ] Each layer shows the path of the file it edits, with a button that opens the Context view on that workspace and file.
- [ ] Each row shows the value in the edited layer and, beside it, the effective value for the chosen workspace, with a badge naming the layer it comes from ("From Account", "Overridden by Local", "Set by your organisation", and the matching Repo wording).
- [ ] Merge rules for the effective value: higher layer wins in the order organisation > local > repo > account; arrays in `permissions.allow`/`ask`/`deny`/`additionalDirectories` and hooks combine across layers; `env` and other objects combine per key; the docs' exceptions (stricter values that beat higher layers) are encoded where the catalog marks them.
- [ ] Organisation layer, read only: `managed-settings.json` in the Windows system location and `remote-settings.json` in the account's folder, when present. Settings it sets show locked with "Set by your organisation".
- [ ] Layer rules from the catalog: `permissions.defaultMode` values `auto` and `bypassPermissions` are only valid in the account layer; `modelPicker`, `askUserQuestionTimeout`, `autoMode`, `permissions.denyInsteadOfPrompting` and the other "user or managed" keys are account-only; `useAutoModeDuringPlan`, `syncClaudeAiSkills`, `syncClaudeAiPlugins` and `skipDangerousModePermissionPrompt` are not valid in the repo layer. Such rows say so and are read-only in the layers where they don't count.
- [ ] Reset per row removes the key from the edited layer.
- [ ] Vitest (pure): the effective value follows the layer order and the array/object merge rules, with the organisation lock and the account-only `defaultMode` values.
