# 03: Model pill with effort, and the Thinking toggle, changed live

**What to build:** the prompt footer gets the extension's model pill, showing the model and effort (e.g. "Opus 5.5 · High"), and a Thinking toggle. Both change the running chat live, without a restart. A pick becomes the default for new sessions, stored where the extension stores it. Work list rows show a small `model · effort` tag.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The pill lists the models from the session's `initialize` reply (display names, e.g. "Default (recommended)", "Opus 5.5", …) with the effort levels each model supports (`supportedEffortLevels`, labelled Low / Medium / High / Extra high / Max as in the extension); models without effort support show no effort choice
- [ ] Choosing a model or effort sends `apply_flag_settings` `{settings:{model, effortLevel}}` (or the extension's exact request per the research doc section 2–3) to the running process; no restart; a one-line muted note in the chat records the change
- [ ] Like the extension, the pick is written to user `settings.json` keys `model` and `effortLevel` (merge, keep all other keys; skip and log if the file can't be parsed) so new sessions — here and in VS Code — start with it
- [ ] Thinking toggle in the footer: on sends `set_max_thinking_tokens` 31999, off sends 0 (field name per the research doc); default on; stored per session
- [ ] Before a session has spawned (no initialize reply yet), the pill shows the stored default and a cached model list from the last initialize of any session
- [ ] Work list rows show a muted `model · effort` tag (model display name short form, effort omitted when unset)
- [ ] Settings → General gets the extension's "Allow dangerously skip permissions" toggle (its `allowDangerouslySkipPermissions` setting, off by default; label and description per the extension). When on, sessions spawn with `--allow-dangerously-skip-permissions`, so Bypass permissions appears in the mode picker and Shift+Tab cycle; when off, Bypass stays hidden as today
- [ ] Tests (pure): models → picker options, pill text, the settings.json merge, the row tag
- [ ] Real-CLI check in a temp workspace: switch model and effort mid-session, the next reply's `system/init`-reported or result-reported model matches, history kept
