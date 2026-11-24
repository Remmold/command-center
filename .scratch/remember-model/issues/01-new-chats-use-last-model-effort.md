# 01: New chats start on the model and effort you last picked

**What to build:** Andreas (2026-11-24): "model doesn't revert back to last selected model / effort level." A new chat (and one started from the project picker) starts on the default model and effort instead of what he last chose. The permission mode already does this: hardening 01 made new chats start in the last-picked mode.

**Blocked by:** None (can start immediately)

**Status:** in-progress

- [x] **Remembering:** picking a model or an effort level in any chat (the model pill, the effort pill, or `/model`) records it as "last picked". Store it per account (profile), since different plans offer different models, plus a global fallback.
- [x] **New chats:**
  - Start with the last-picked model and effort for the workspace's account, falling back to the global last pick, then the account's settings default (`settings.json` model / `modelSettings.<id>.effortLevel`), then the CLI default.
  - Skip a remembered model or effort the account doesn't offer, using its `initialize` model list.
  - The pills show the value at once, before `initialize` arrives.
- [x] **Existing chats** keep their own model and effort.
- [x] **Resumed chats** keep what they had, if stored; otherwise they use the rule above.
- [x] **Order of precedence:** check whether the extension writes the user's `settings.json` default when a model is picked. If it does, mirror its behaviour exactly and log it. Otherwise keep the app-side memory and **never write the user's settings files**.
- [x] **Tests:**
  - pure: the resolution order (per account, global, settings, CLI), dropping unavailable values, existing chats untouched;
  - **no new UI scenario**: extend an existing model/effort step so it picks a model and effort, opens a new chat, and checks the pills and the CLI `--model`/effort flags in the fake's log.
  - Gate: quick, `e2e:gate`, perf and zoom.
