# 08: Environment editor

**What to build:** the Environment category is a name/value table with a catalog of every documented variable, plain explanations and typed inputs for the useful ones, and masked secrets. Spec: `.scratch/claude-settings/spec.md` (user stories 32–35; "Setting catalog" environment-variable catalog).

**Blocked by:** 05

**Status:** resolved

- [x] A table of name and value for the edited layer's `env`, with the effective values for the workspace.
- [x] The name field autocompletes every documented variable name.
- [x] About 60–80 useful ones also carry a description and a value type (on/off, number, text) and show a typed input.
- [x] A value whose name contains KEY, TOKEN, SECRET or PASSWORD is masked until clicked to show.
- [x] Vitest: the environment catalog has unique names; masking applies by name.
