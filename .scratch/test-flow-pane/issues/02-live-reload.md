# 02: Test tab reloads when the file changes, keeping the scroll place

**What to build:** when Claude rewrites the shown test flow, the Test tab reloads by itself and keeps the scroll place; if Andreas is on another tab, the Test tab gets a dot (spec: `.scratch/test-flow-pane/spec.md`).

Rules (from the spec, word for word):
- The reader watches the resolved file, through `fs.watch` with a poll as backstop as the transcript tail does, and sends one change event per file per change. Watches are dropped when nothing shows that file any more.
- The scroll place is kept across reloads per file.
- When the file changes while another tab is active, the tab gets a dot until it is opened.
- A session that starts writing a new test-flow file switches the tab to it (the finder's latest write wins).
- Spec amendment (after ticket 01's real-data check, word for word): the finder returns every pick newest-first (each file once), with the repo-named file last, and the reader shows the first that exists. A shell command that only names a file that isn't there (a probe, a typo) then never blanks the tab.
- A pick that appears on disk later (Claude creates the file it named) is shown once it exists: the watch covers the candidates that don't exist yet, as well as the shown file.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Unit test (seam 2, rest) against a temp folder: a change to the file → one change event; the watch is released when no one shows the file.
- [ ] The tab reloads on change and stays at the same scroll place; the dot shows on another tab and clears when the Test tab opens.
- [ ] The ticket 01 UI scenario is extended: a rewrite of the file reloads the tab (still one scenario).
- [ ] Quick tier green.
