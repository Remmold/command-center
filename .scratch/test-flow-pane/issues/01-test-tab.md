# 01: Test tab shows the session's test flow

**What to build:** every session gets a Test tab beside Chat, Agents and Media that shows its test flow (spec: `.scratch/test-flow-pane/spec.md`). The test flow is the file the session last wrote in the test-flows folder, else `<repo name>.md`. It is shown as its HTML twin with working click-to-copy and no network, or rendered markdown when there is no twin. The folder is a setting.

Rules (from the spec, word for word):
- **Test-flow finder (shared, pure, the one deep module).** Input: a session's chat items (subagent items included), the test-flows folder, and the session's repo name. Output: `{ path, source: 'session' | 'repo' } | null` naming the file to show before twin resolution.
  - A **write** is an assistant `tool_use` block named `Write`, `Edit`, `MultiEdit` or `NotebookEdit` whose `file_path` is directly inside the folder, or a `Bash` (or `PowerShell`) call whose command names such a file. Paths compare case-insensitively with either slash, as the Media tab's collector does.
  - Only `.md` and `.html` files count. Names ending `-commands.md` or `-commands.html` never count.
  - The latest write in item order wins.
  - No write: `<repo name>.md` in the folder, source `repo`. The finder doesn't check the disk.
- **Repo name** for the fallback: the workspace's repo identity (the main checkout's folder name), so worktrees share their repo's name; a workspace that isn't a git repo uses its folder name.
- **Test-flow reader (main process).** Given a path the finder produced, it refuses anything outside the configured folder. It resolves an `.md` to its `.html` twin when the twin exists. It returns `{ found: false }`, `{ kind: 'html', url }` or `{ kind: 'md', text }`. (Watching is ticket 02.)
- **HTML display:** the HTML twin is served to the renderer through a read-only custom scheme limited to the test-flows folder, as `cc-media` serves media, and shown in a sandboxed frame that may run the page's own script (click-to-copy) but may not load anything from the network.
- **Markdown display:** the app's existing Markdown component, read-only.
- **Test tab:** a fourth chat tab id `test` beside `chat`, `agents` and `media`, always shown. Its header holds the file name (and, from ticket 03, the pop-out button).
- When no file is found, the tab says so and names the folder and the repo name it looked for.
- VS Code (observed) sessions focused in Work get the Test tab by the same rules.
- **Setting:** the test-flows folder, default `C:\projects\test-flows`, kept in its own settings file in the app's user data as the Board's scan roots are, and editable as a folder field in Settings → General. UI tests set it to a temp folder.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Unit tests (seam 1) for the finder: Write, Edit and a Bash render command each caught; the latest write wins; subagent items count; `-commands` files and files outside the folder or in a subfolder ignored; case and slashes don't matter; repo fallback when nothing was written. Prior art: the Media tab's collector tests.
- [ ] Unit tests (seam 2, part) for the reader against a temp folder: `.md` with twin → html, `.md` alone → md text, missing → not found, a path outside the folder → refused.
- [ ] Click-to-copy in the shown HTML copies to the clipboard; no http(s) request leaves the frame.
- [ ] New UI scenario on the fake CLI with a temp test-flows folder: a chat whose reply writes a test-flow file shows it in the Test tab (the test may write the file itself; the fake CLI's Write doesn't touch disk). That makes 16 of the 20-scenario budget on this branch.
- [ ] Quick tier green.
