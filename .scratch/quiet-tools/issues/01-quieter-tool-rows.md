# 01: Tool rows show less, like VS Code

**What to build:** Andreas (2026-11-23), on a busy transcript: "feels like we display more hard to read data than VS Code does. Things we might not want to see." His screenshot showed:
- every tool row with its IN and OUT boxes open;
- Bash rows headed by the raw command (`cd C:/… && pnpm exec oxfmt …`);
- **TaskStop** rows with raw JSON in and out;
- a long PowerShell command line.

This reverses the transcript-look decision that IN and OUT boxes always show.

**Blocked by:** None (can start immediately). The UI suite is at 14 scenarios, ~71 s of the 90 s budget.

**Status:** ready-for-agent

- [ ] **Collapsed by default:** a tool row is one line (dot, tool name, short label). IN and OUT open on click, as the extension does. Check the extension bundle for which tools it shows expanded by default, if any (Edit and Write diffs, perhaps), and match it. Errors still show their message line.
- [ ] **Bash label:** use the Bash call's `description` field (Claude's short summary) as the row label, as VS Code does. The command itself appears only in the expanded IN box. Without a description, show the command trimmed to one line.
- [ ] **Plumbing tools:**
  - hide tools the extension hides: ToolSearch (already hidden), TaskStop, TaskOutput, KillShell/BashOutput and similar. Confirm the list from the bundle.
  - where the extension shows a quiet line instead, do the same, e.g. "Stopped 2 background tasks".
  - Never show raw JSON in a row header.
- [ ] **OUT text:** when expanded, show readable text. For a JSON result, show its `message` or `result` field. Pretty-print the whole JSON only behind a "raw" toggle. The `<persisted-output>` notes become "Output saved to file (34.9 KB)" with a link that opens the file.
- [ ] **Everywhere:** this applies to hosted chats, VS Code chats, subagent live views and the approval inbox context alike.
- [ ] **Tests:**
  - pure: the row label rules (description vs command), the hidden-tool list, the OUT text extraction, the persisted-output note;
  - adjust existing UI assertions that expect open boxes. No new scenario.
  - The perf guard stays green.
