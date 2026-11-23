# 01: "Default" shows the real model name; effort gets its own window

**What to build:** Andreas (2026-11-23):
- "'Default' should also show the model name."
- "Effort slider should be a separate window, not the same as model."

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **Default model name:**
  - Wherever a chat's model shows as "Default" (Work list rows "Default · Medium", the Dashboard, the model pill, the project picker), show the model it actually resolves to, e.g. "Opus 5.5".
  - The source is the session's `initialize` reply: its models list marks which one is default, or the `model` it reports. Check the recording in `src/main/claude/fixtures/initialize-reply.json` and the extension bundle for how VS Code labels its default entry.
  - Before `initialize` arrives (a chat not started yet), show the last known resolution for that account, cached per profile, as "Default (Opus 5.5)". With nothing known, "Default".
  - The model menu's default row keeps the extension's wording, plus the resolved name if the extension shows it.
- [x] **Effort gets its own control:**
  - Take the effort slider (`EffortRow`) out of the model menu (`ModelPicker`) and out of the mode menu (`PermissionModePicker`).
  - Add an **effort pill** in the prompt footer, right after the model pill. It shows the current level ("Medium") and opens **its own popover** with only the effort slider and the level's description.
  - It is keyboard reachable.
  - It hides when the model has no effort levels. Changes made during start-up queue as today.
  - The model pill then shows only the model name, without the effort word.
  - Keep the footer's narrow rules: below the footer's container width, the effort pill shows a short form (an icon or the first letter) rather than overlapping. The zoom check must cover it.
- [x] **Tests:**
  - pure: the default-name resolution (from initialize, from cache, unknown) and the label text;
  - **no new UI scenario** (budget ≤ 20, 18 used, runtime near the 90 s limit). Adjust the existing model/effort assertions in the split e2e files to the new popover, and list which scenarios you changed.
  - The perf guard and zoom check stay green.

**Scenarios changed:** `e2e/chat.spec.ts` "a basic chat: …" (step "a model and effort change send apply_flag_settings": the model menu has no Effort row, the pill shows only the name, the effort pill opens by keyboard with the slider focused). Zoom check `e2e/shots/zoom.shots.ts`: the effort pill in every footer (single and split; icon-only at 150 % split) plus a `work-effort` shot. No new scenario.
