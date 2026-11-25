# 05: Start a drift check from tour step 6

**What to build:** tour step 6 starts a drift check that runs while Andreas stays in Context, and its findings land on the map live (spec: `.scratch/context-analysis/spec.md`). It replaces the Clean up menu.

Rules (from the spec, word for word):
- **Drift check (Claude, costs tokens).** Step 6 replaces today's Clean up menu, keeping the same three kinds (This project, Account, Across projects…) and covering the same files. It shows a cost note and the model and effort pickers. **Start** creates a hosted session on the workspace's account and sends the prompt itself, and Andreas stays in Context. The session writes its progress and findings to a findings file in the app's data folder (ADR 0005). The map watches that file and fills in as the run goes: the run's steps tick off, and findings appear on their blocks. "Open chat" jumps to the session in Work.
- **Drift-check prompt builder** replaces the cleanup builder (same inputs, same covered files and three kinds). It also tells the session the findings file's path, the schema, to set the steps first (one per subagent), to update a step's status and append findings as each subagent reports, and to mark findings `applied` or `skipped` when asked to fix them. It still says that account files are shared by every workspace of the account. `addDirs` gains the findings folder.
- The app writes the run's skeleton (everything except the session's steps and findings, which start as `[]`) before starting the session. After that, only the session writes the file.
- **Starting with a sent prompt.** Session navigation's start-session path gains a `send` option: the session is created with the chosen model, effort and added folders, starts its process, and is sent the prompt as its first message, without leaving the current view. The chat lives in Work as every hosted chat does (ADR 0004). Without `send`, behaviour is unchanged.
- Rename "Context cleanup" to "Drift check" in code and UI (glossary already updated). The old Clean up menu and its chat-only prompt are removed; the Across projects dialog is kept and opened from step 6.
- **UI scenario (seam 6), part 1.** The fake CLI gains a `write_file` event (writes real content to a path, with `{findingsPath}` substituted from the prompt). The existing Clean up scenario in the Context spec is rewritten, so the budget stays at 13 of 20: Map → tour Next to step 5 shows the seeded MEMORY.md-over-200-lines finding → step 6 → This project → Start → the fake run writes a finding → it appears on its block. (Ticket 06 extends this same scenario with tick → Apply.)

**Blocked by:** 03, 04

**Status:** resolved

- [x] Prompt builder tests (seam 4), replacing the cleanup builder's tests: the same coverage assertions, plus the findings path and schema in the prompt, and the findings folder in `addDirs`.
- [x] `send` starts the session and sends the prompt without leaving Context; without `send`, start-session behaves as before.
- [x] Step 6 shows the three kinds, the cost note and the model and effort pickers; Start works; Open chat jumps to Work.
- [x] The Clean up menu is gone; no "cleanup" naming is left in the UI.
- [x] The fake CLI's `write_file` event is documented in its README and covered by its own tests.
- [x] The rewritten Context UI scenario passes; the scenario count is still 13 of 20 (by `e2e/budget.ts`'s counter).
- [x] This changes how a chat starts, so run the whole UI suite once before committing.
- [x] Quick tier green.
