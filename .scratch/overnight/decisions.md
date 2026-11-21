# Overnight decisions log

Each entry records what was decided, why, and the alternative. Review these in the morning.

1. **Effort is saved as `modelSettings.<model id>.effortLevel` in `settings.json`**, not a top-level `effortLevel`.
   - Why: that's where the CLI and the extension keep it. The CLI ignores a top-level key at startup, and "Max" is never saved.
   - Alternative: the top-level key the ticket named, which would have no effect.
2. **The app writes `settings.json` itself, in place**, rather than asking the CLI to save it.
   - Why: the CLI replaces the file when it saves, which breaks the hard link that shares it with your other account profiles.
   - Alternative: use the CLI's `update_settings` and lose that sharing.
3. **Thinking on/off is stored per chat, with a toggle in the prompt footer.**
   - Why: the extension keeps it in VS Code's own storage and puts it in its `/` menu. Neither exists here, so the ticket's footer toggle stays.
   - Alternative: an app-wide setting.
4. **The model pill reads "Opus 5.5 High"**, effort muted and no separator, exactly like the extension. Work list rows read "Opus 5.5 · High".
5. **Test credentials are never copied any more.**
   - Why: ticket 03 copied your `.credentials.json` into a temp home, and a token refresh there can rotate your real login. A no-prompt probe confirmed your real login still works.
   - Instead: permission tests that must avoid your allow rules use `--setting-sources project,local`. Everything else uses the fake CLI.
6. **The "new X session here" menu items no longer change the default model.**
   - Why: the default now lives in `settings.json`, as in the extension.
7. **The "tokens today" tally and its "≈ $ api-equiv" figure are gone** from the strip and the Dashboard.
   - Why: on a subscription they measure nothing you're limited by. The real 5-hour and weekly limits now show for every profile.
   - Alternative: keep counting result tokens per profile next to the limits.
8. **The Account & Usage popover shows Email, Organization, Plan, "Session (5hr)", "Weekly (7 day)", last updated and Refresh.** It leaves out the extension's "Auth method" row, the "Weekly Sonnet" / per-model bars and the "Manage usage on claude.ai" link.
   - Why: the ticket names only the two windows, and the app has no auth-status probe to fill "Auth method".
   - Wording, from the extension: "Loading usage data…", "Failed to load usage data" with Retry, "Plan limits aren't available for this login method.", and "Resets Mon, Nov 23 at 11:59 PM".
9. **"Log in" sits in the popover, not on the strip.** Each strip entry is itself a button, and a button can't hold another button. The strip says "not logged in" under the profile name.
10. **Tooltips follow the ticket; the popover follows the extension.**
    - Strip tooltips: "Session (5hr) 42% · resets in 2h 10m" and "Weekly (7 day) 71% · resets Tue 00:00" (24-hour, local time).
    - Popover: the extension's 12-hour en-US wording.
    - Percentages are rounded down, as in the extension, and bars warn from 80%.
11. **How the usage check runs.**
    - It starts in an empty folder under the app's data folder.
    - Profiles without a credentials file are never checked.
    - A reply with no account details counts as "not logged in".
    - Logging in is noticed at the next check. Refresh checks at once.
12. **The chat header's account dropdown replaces the profile picker there.**
    - It lists profiles by email and plan, and grays out the ones not logged in.
    - Picking one restarts the running chat on it, with `--resume`, after the current turn. A chat with no running process simply starts on the new profile when you next send.
    - Creating and renaming profiles stays in Settings → Accounts and the Workspaces settings.
13. **"No" with feedback on the plan prompt uses the new wording too.**
    - Why: it sends the same deny reply, and the same injection worry applies. "No" without feedback on the plan prompt still says "User chose to stay in plan mode and continue planning".
    - Alternative: keep the extension's exact wording for plan feedback.
14. **Typed feedback goes to Claude inside plain double quotes, unescaped, with spaces trimmed from both ends.** Quotes and line breaks inside it are passed on unchanged.
    - Why: escaping would show Claude `\n` and `\"` instead of what was typed. The trimming was already there.
    - Alternative: JSON-escape the text.
15. **The fake CLI runs on the app's own binary as Node** (`process.execPath` with `ELECTRON_RUN_AS_NODE=1`, passed only for the fake's launch), not on the system `node`.
    - Why: no dependency on a Node install or its version; vitest runs it the same way under plain Node.
    - Alternative: system `node` from PATH.
16. **With `CC_CLAUDE_BIN` set, the Default profile reads `CLAUDE_CONFIG_DIR` instead of `~/.claude`.** Without it the app still always uses `~/.claude`.
    - Why: otherwise a test run reads and writes the real `~/.claude/settings.json` (model defaults) and credentials check.
    - Alternative: honour `CLAUDE_CONFIG_DIR` always, like the CLI; rejected because a session's own `CLAUDE_CONFIG_DIR` could leak into a `pnpm dev` started from it.
17. **The fake's interrupted result is built from the CLI's own result schema, not recorded.** The recording's interrupt arrived before the turn started, so the CLI answered `still_queued: []` and ran the turn. The shape (`subtype: error_during_execution`, `is_error: true`, `errors: []`, no `result`) comes from the schema inside the CLI binary; the "[Request interrupted by user]" note comes from the app's existing interrupt handling.
    - Real tokens spent: 2 Haiku prompts (the approval turn and the one meant to be interrupted).
18. **`pnpm e2e` always builds first** (`electron-vite build`, about 6 s), instead of checking whether `out/` is stale.
    - Why: a staleness check can miss a changed file and test an old app; the build is cheap next to the suite.
    - Alternative: compare `out/` and `src/` timestamps and skip the build.
19. **Each smoke test also gets its own temp home** (`USERPROFILE`/`HOME`), on top of the temp user data, workspace and `CLAUDE_CONFIG_DIR`. Tests run one at a time; the whole suite takes about 12 s, so running them in parallel isn't worth the risk.
20. **`pnpm e2e` is documented in `CLAUDE.md` as part of the full check before a merge or release**, without the term "Ship mode", which comes from your personal instructions and not the team's.
21. **Smoke-test teardown kills leftovers by a process snapshot, not by `taskkill /T` after the fact.** Before quitting, it records the app's process tree (PID and start time). After the quit, it kills any of those still running. A child left behind after its parent exits can't be reached through the parent, and matching start times means a reused PID is never killed. This costs about 1 s per test.
