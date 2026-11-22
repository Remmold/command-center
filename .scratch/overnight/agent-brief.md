# Standing brief for overnight ticket agents

Read this in full before you start.

- **Process:** follow `C:\Users\remmold\.claude\plugins\cache\mattpocock\mattpocock-skills\1.3.2\skills\engineering\implement\SKILL.md`. Use the Skill tool for `mattpocock-skills:tdd` on the pure seams, test-first, and for `mattpocock-skills:code-review` at the end. Use `frontend-discipline` before UI work and `comment-discipline` when writing code.
- **Rules:** repo rules are in `CLAUDE.md`, vocabulary in `GLOSSARY.md`, decisions in `docs/adr/`. Overnight rules are in `.scratch/overnight/plan.md`.
- **Decisions:** when the spec or ticket doesn't settle something, pick the option closest to the VS Code extension. Append it to `.scratch/overnight/decisions.md`, numbered, with the alternative, and keep going.
- **Mimic the extension exactly**: wording, look, keys and behaviour. Evidence is in `docs/research/vscode-extension-controls.md` and `docs/research/vscode-extension-input.md`. Settle anything marked UNCONFIRMED against the bundle at `C:\Users\remmold\.vscode\extensions\anthropic.claude-code-2.1.330-win32-x64\` (`webview/index.js`, `extension.js`, `package.json`). Grep small windows, e.g. `grep -o '.\{200\}TERM.\{300\}'`; never print whole minified lines.
- **Ticket status:** set `**Status:** in-progress` before your first code edit and `**Status:** resolved` after your final commit, or `**Status:** blocked — <why>`. Tick the checkboxes. Add one line to the feature's `progress.md`, in the form `- NN resolved: <what> — <commit>`. After each round, overwrite `<ticket>.progress.md` with 3 lines: done, next step, open reds.
- **Testing costs zero tokens by default.**
  - Use the fake CLI (`tools/fake-claude/`, see its README) and add scenarios to the Electron smoke suite (`e2e/smoke.spec.ts`, `pnpm e2e`).
  - Real CLI only when the ticket needs real behaviour: Haiku, one-line prompts, at most 3 per ticket. Run it in a temp workspace under `C:\Users\remmold\AppData\Local\Temp\claude\c85b1d19935b6b03\94ac3789-dfed-4f49-9914-b5b495f3362a\scratchpad\`.
  - Control-only probes (no prompt) are free.
  - Never copy or modify `~/.claude/.credentials.json`, `~/.claude/settings.json` or anything in `%APPDATA%\command-center`. Never touch Andreas's installed copy (`C:\Users\remmold\AppData\Local\Programs\command-center\`) or his repos.
  - Kill only your own processes.
- **Dev loop:** `pnpm build` + `pnpm quick` each round. `pnpm e2e` must be green before your final commit. Run `unset ELECTRON_RUN_AS_NODE` before launching Electron yourself.
- **Git:** the pre-commit hook runs `pnpm quick`; never bypass it. Commit only your own paths: `git add` new files first, then `git commit -- <paths>`. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never post, never `git stash`, checkout or reset.
- **Test page:** if your change alters something on `C:\projects\test-flows\command-center.md`, update that page. Then run `python C:\projects\tools\render_test_flow.py command-center.md` from `C:\projects\test-flows\`.
- **Report back in ≤10 lines:** commit hashes; quick and e2e results, naming any red check with its FAIL lines; how many real prompts you spent; decisions you logged; anything the next ticket needs.
