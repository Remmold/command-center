# 01: Open a project, and its recent sessions come with it

**What to build:** Andreas (2026-11-23): "opening project/sessions should be simpler and recent sessions should also come with, when you open, let's say, darkfall-companion." He chose **one picker: the project, then its recent sessions**.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] **One picker:** **+ New session** and Ctrl+T open one quick picker in the VS Code quick-pick style the app already uses.
  - **Step 1:** type to filter projects (workspaces), using each repo's icon and account tag. Enter or click opens step 2. Recently used projects come first.
  - **Step 2:**
    - the project's name sits in the picker title, with a Back arrow (Backspace on an empty filter goes back);
    - the first row is **+ New chat**;
    - under it are that project's **recent sessions**, newest first: title, age, git branch and an open/live dot, the same data and labels as Past conversations;
    - typing filters them by title or branch;
    - Enter on New chat starts a chat; Enter on a session resumes it, or switches to its tab if it's already open;
    - a session live in VS Code offers **Take over when done / Take over now**, as Past conversations does.
- [x] **Past sessions:** the Work list menu's **Past sessions…** and Ctrl+L open the same picker, straight at step 2 for the focused chat's project (or at step 1 if there's none). The old two-dialog path goes away. Keep the rename-on-hover the old list had, inside step 2.
- [x] **Speed:** step 2 lists sessions fast: show cached titles at once, then refresh. Show at most the 50 newest, with "Show all" at the end.
- [x] **Keyboard:** fully keyboard-driven; Esc closes it; it fits at 150% zoom.
- [x] **Tests:**
  - pure: the picker's step model (project order by recency, filter, back, which action an Enter triggers);
  - **no new UI scenario** (the suite budget is ≤ 20): extend the existing past-sessions/session-history scenario to go through the new picker. Say in your report which scenario you extended.
  - The perf guard and zoom check stay green.
