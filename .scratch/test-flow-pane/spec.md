# Test tab: each session's test flow, in the app and in a pop-out window

Status: ready-for-agent

## Problem Statement

When Claude changes something Andreas must check by hand, it writes a test flow: a markdown file in `C:\projects\test-flows\` with a rendered HTML twin that he tests from in a browser. He runs 3–4 sessions in parallel across repos. Each time he switches session he has to remember which file belongs to it (command-center.md, darkfall64.md, or one of 60+ Continuum per-ticket files such as continuum-1220-ai-person-card.md), find it, open it, and reload it after Claude rewrites it. The browser tab he has open is often another session's doc, or an old version.

## Solution

A **Test tab** beside Chat, Agents and Media shows the session's test flow: the HTML twin exactly as the browser shows it, with its click-to-copy rows. The session's test flow is the file it last wrote in the test-flows folder; if it wrote none, the one named after its repo. When Claude rewrites the file, the tab reloads and keeps the scroll place. A pop-out button opens the same view in its own window, which follows whichever session is focused in Work, so a second monitor always shows the up-to-date test flow for the session in front of him.

## User Stories

1. As Andreas, I want a Test tab beside Chat, Agents and Media in every session, so that the test flow is one click from the chat.
2. As Andreas, I want the Test tab to show the test flow this session last wrote in the test-flows folder, so that a Continuum ticket session shows its own ticket doc.
3. As Andreas, I want a file to count as written when the session created or edited it, or ran a shell command that names it (such as the HTML render script), so that the usual ways Claude writes test flows are all caught.
4. As Andreas, I want writes by the session's subagents to count too, so that a ticket agent's test flow shows.
5. As Andreas, I want the standing `*-commands` files never to count as a session's test flow, so that a commands edit doesn't hide the current run.
6. As Andreas, I want a session that wrote no test flow to show the one named after its repo, so that a fresh session in command-center shows command-center's doc.
7. As Andreas, I want a worktree session to fall back to its repo's name, not its folder's, so that command-center-processes shows command-center.md.
8. As Andreas, I want a written .md to show its .html twin when the twin exists, so that I see the same page I'd test from in the browser.
9. As Andreas, I want an .md without a twin rendered with the app's markdown view, so that a doc still shows before it is rendered.
10. As Andreas, I want an HTML file the session wrote there (such as an explainer page) to show as it is, so that whatever Claude last put in front of me is what I see.
11. As Andreas, I want the click-to-copy rows to copy as they do in the browser, so that I can run commands from the tab.
12. As Andreas, I want the tab to reload when the file changes on disk, so that I never test from an old version.
13. As Andreas, I want the reload to keep my scroll place, so that I don't lose where I was mid-run.
14. As Andreas, I want a dot on the Test tab when the file changes while I'm on another tab, so that I notice a new run.
15. As Andreas, I want the tab, when no file is found, to say so and name the folder and the repo name it looked for, so that I know why it is empty.
16. As Andreas, I want the tab header to show the file's name, so that I know which doc I'm reading.
17. As Andreas, I want the page shown without any network access, so that the app keeps its offline rule.
18. As Andreas, I want VS Code sessions focused in Work to get the Test tab by the same rules, so that it doesn't matter where the session runs.
19. As Andreas, I want a pop-out button on the Test tab that opens the view in its own window, so that I can put it on another monitor.
20. As Andreas, I want the pop-out to follow whichever session is focused in Work, so that it always shows the current session's test flow.
21. As Andreas, I want the pop-out to keep the last session's doc while I'm in another view, so that it doesn't go blank when I glance at the Board.
22. As Andreas, I want the pop-out to reload on file changes and keep its scroll place per file, as the tab does, so that both behave alike.
23. As Andreas, I want the pop-out to reopen where I last put it (monitor and size), so that I place it once.
24. As Andreas, I want pressing the pop-out button again while the window is open to bring it to the front, so that I never get two.
25. As Andreas, I want closing the main window to the tray to leave the pop-out open, and quitting the app to close it, so that it behaves like part of the app.
26. As Andreas, I want the test-flows folder set in Settings → General, prefilled with `C:\projects\test-flows`, so that it isn't hard-wired.

## Implementation Decisions

- **Test-flow finder (shared, pure, the one deep module).** Input: a session's chat items (subagent items included), the test-flows folder, and the session's repo name. Output: `{ path, source: 'session' | 'repo' } | null` naming the file to show before twin resolution.
  - A **write** is an assistant `tool_use` block named `Write`, `Edit`, `MultiEdit` or `NotebookEdit` whose `file_path` is directly inside the folder, or a `Bash` (or `PowerShell`) call whose command names such a file. Paths compare case-insensitively with either slash, as the Media tab's collector does.
  - Only `.md` and `.html` files count. Names ending `-commands.md` or `-commands.html` never count.
  - The latest write in item order wins.
  - No write: `<repo name>.md` in the folder, source `repo`. The finder doesn't check the disk.
- **Repo name** for the fallback: the workspace's repo identity (the main checkout's folder name), so worktrees share their repo's name; a workspace that isn't a git repo uses its folder name.
- **Test-flow reader (main process).** Given a path the finder produced, it refuses anything outside the configured folder. It resolves an `.md` to its `.html` twin when the twin exists. It returns `{ found: false }`, `{ kind: 'html', url }` or `{ kind: 'md', text }`. It watches the resolved file, through `fs.watch` with a poll as backstop as the transcript tail does, and sends one change event per file per change. Watches are dropped when nothing shows that file any more.
- **HTML display:** the HTML twin is served to the renderer through a read-only custom scheme limited to the test-flows folder, as `cc-media` serves media, and shown in a sandboxed frame that may run the page's own script (click-to-copy) but may not load anything from the network. The scroll place is kept across reloads per file.
- **Markdown display:** the app's existing Markdown component, read-only.
- **Test tab:** a fourth chat tab id `test` beside `chat`, `agents` and `media`, always shown. Its header holds the file name and the pop-out button. When the file changes while another tab is active, the tab gets a dot until it is opened.
- **Pop-out window (main process):** at most one, a second `BrowserWindow` loading the renderer in a test-flow-only mode. The main window's renderer publishes the focused Work session's `{ finder result, session title }` to the main process whenever it changes. It does not publish while Work isn't on screen, so the pop-out keeps the last one. The main process forwards it to the pop-out. Its place is saved and restored with the existing window-place code under its own key. Off-screen in test runs, as the main window is. It closes when the app quits and stays when the main window hides to the tray.
- **Setting:** the test-flows folder, default `C:\projects\test-flows`, kept in its own settings file in the app's user data as the Board's scan roots are, and editable as a folder field in Settings → General. UI tests set it to a temp folder.

## Testing Decisions

- Good tests check what Andreas would see from a real arrangement: given these chat items, this file is the session's test flow; given these files on disk, this is shown. They don't test how the tab is laid out.
- **Seam 1, the finder**, unit-tested with chat-item fixtures:
  - Write, Edit and a Bash render command are each caught.
  - The latest write wins, and subagent items count.
  - `-commands` files and files outside the folder or in a subfolder are ignored.
  - Case and slashes don't matter.
  - The repo fallback applies when nothing was written.

  Prior art: the Media tab's collector tests.
- **Seam 2, the reader**, unit-tested against a temp folder: `.md` with twin → html, `.md` alone → md text, missing → not found, a path outside the folder → refused, a change to the file → one change event. Prior art: the context reader tests and the transcript tail tests.
- **Seam 3, one UI scenario** on the fake CLI with a temp test-flows folder:
  - A chat whose reply writes a test-flow file shows it in the Test tab, and a rewrite of the file reloads the tab.
  - The pop-out opens showing the same file, and switching to a second chat in another workspace switches the pop-out to that workspace's repo-named file.

  That makes 17 of the 20-scenario budget (with feature/context-cleanup's 16 merged first; 16 if this lands alone).

## Out of Scope

- Ticking checkboxes or remembering ticks.
- An always-on-top pin, or a window title naming the session.
- A picker for choosing among a repo's test-flow files.
- Editing test flows in the app, or running the render script from the app.
- Showing a test flow for Board tickets or the Dashboard.
- Any change to the test-flow skill or the render script.

## Further Notes

- feature/context-cleanup also adds a UI scenario; whichever merges second must keep the total within the 20-scenario, 90-second budget.
- The pop-out follows the focused half when two chats are side by side.
