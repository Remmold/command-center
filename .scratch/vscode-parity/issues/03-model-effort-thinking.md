# 03: Model pill with effort, and the Thinking toggle, changed live

**What to build:** the prompt footer gets the extension's model pill, showing the model and effort (e.g. "Opus 5.5 · High"), and a Thinking toggle. Both change the running chat live, without a restart. A pick becomes the default for new sessions, stored where the extension stores it. Work list rows show a small `model · effort` tag.

**Blocked by:** 01

**Status:** resolved

- [x] The pill lists the models from the session's `initialize` reply (display names, e.g. "Default (recommended)", "Opus 5.5", …) with the effort levels each model supports (`supportedEffortLevels`, labelled Low / Medium / High / Extra high / Max as in the extension); models without effort support show no effort choice
- [x] Choosing a model or effort sends `apply_flag_settings` `{settings:{model, effortLevel}}` (or the extension's exact request per the research doc section 2–3) to the running process; no restart; a one-line muted note in the chat records the change
- [x] Like the extension, the pick is written to user `settings.json` keys `model` and `effortLevel` (merge, keep all other keys; skip and log if the file can't be parsed) so new sessions — here and in VS Code — start with it
- [x] Thinking toggle in the footer: on sends `set_max_thinking_tokens` 31999, off sends 0 (field name per the research doc); default on; stored per session
- [x] Before a session has spawned (no initialize reply yet), the pill shows the stored default and a cached model list from the last initialize of any session
- [x] Work list rows show a muted `model · effort` tag (model display name short form, effort omitted when unset)
- [x] Settings → General gets the extension's "Allow dangerously skip permissions" toggle (its `allowDangerouslySkipPermissions` setting, off by default; label and description per the extension). When on, sessions spawn with `--allow-dangerously-skip-permissions`, so Bypass permissions appears in the mode picker and Shift+Tab cycle; when off, Bypass stays hidden as today
- [x] Tests (pure): models → picker options, pill text, the settings.json merge, the row tag
- [x] Real-CLI check in a temp workspace: switch model and effort mid-session, the next reply's `system/init`-reported or result-reported model matches, history kept

**Notes (verified 2026-11-21 against extension 2.1.330 and CLI 2.1.293):**
- Effort default: the extension saves effort through the CLI's `update_settings`, which writes `modelSettings.<full model id>.effortLevel` (Max is never saved). A top-level `effortLevel` is ignored by the CLI at startup. The app writes `model` and `modelSettings.<id>.effortLevel` itself, in place, because the CLI's own write replaces the file and breaks the hard link other profiles share.
- The extension's pill reads "Opus 5.5 High" (effort muted, no "·"); the app copies that. Work list rows use `model · effort` as the ticket says.
- The extension keeps Thinking in VS Code global state and shows it in its `/` menu; per the ticket the app keeps it per session with a footer toggle.
